import { KEYUTIL, KJUR } from 'jsrsasign';
import { randomBytes, createHash, randomUUID } from 'crypto';
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'fs';
import rs from 'jsrsasign';

// ported from https://github.com/aguinane/SEP2-Tools/blob/2eb5d58be73b17f2ecd31af1389ad28973551399/sep2tools/cert_create.py
// OID for "X509v3 Any Policy"
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ANY_POLICY_OID = '2.5.29.32.0';

// IEEE 2030.5 device type assignments (Section 6.11.7.2)
const SEP2_DEV_GENERIC = '1.3.6.1.4.1.40732.1.1';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const SEP2_DEV_MOBILE = '1.3.6.1.4.1.40732.1.2';
const SEP2_DEV_POSTMANUF = '1.3.6.1.4.1.40732.1.3';

// IEEE 2030.5 policy assignments (Section 6.11.7.3)
const SEP2_TEST_CERT = '1.3.6.1.4.1.40732.2.1';
const SEP2_SELFSIGNED = '1.3.6.1.4.1.40732.2.2';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const SEP2_SERVPROV = '1.3.6.1.4.1.40732.2.3';
const SEP2_BULK_CERT = '1.3.6.1.4.1.40732.2.4';

// HardwareModuleName (Section 6.11.7.4)
const SEP2_HARDWARE_MODULE_NAME = '1.3.6.1.5.5.7.8.4';

const DEFAULT_POLICIES = [
    SEP2_DEV_GENERIC,
    SEP2_DEV_POSTMANUF,
    SEP2_TEST_CERT,
    SEP2_SELFSIGNED,
    SEP2_BULK_CERT,
];

export function getCertificateLfdi(certPem: string): string {
    const cert = new rs.X509();
    cert.readCertPEM(certPem);

    // Get the DER encoded certificate
    const derEncoded = cert.hex;

    // Calculate the SHA-256 hash of the DER encoded certificate
    const sha256Hash = createHash('sha256')
        .update(Buffer.from(derEncoded, 'hex'))
        .digest('hex');

    // Convert hash to uppercase and take the first 40 characters
    const result = sha256Hash.toUpperCase().slice(0, 40);

    return result;
}

export function generateCertRequestAndKey({
    csrPath,
    keyPath,
}: {
    csrPath: string;
    keyPath: string;
}) {
    if (existsSync(csrPath)) {
        console.log(
            `Certificate signing request file "${csrPath}" exists, aborting to prevent overwrite`,
        );
        process.exit(1);
    }

    if (existsSync(keyPath)) {
        console.log(
            `Certificate private key file "${keyPath}" exists, aborting to prevent overwrite`,
        );
        process.exit(1);
    }

    const keyPair = KEYUTIL.generateKeypair('EC', 'secp256r1');

    const publicKey = KEYUTIL.getPEM(keyPair.pubKeyObj);
    const privateKey = KEYUTIL.getPEM(keyPair.prvKeyObj, 'PKCS8PRV');

    const csr = new KJUR.asn1.csr.CertificationRequest({
        subject: { str: '' },
        sbjpubkey: publicKey,
        sigalg: 'SHA256withECDSA',
        sbjprvkey: privateKey,
    });

    const pem = csr.getPEM();

    writeFileSync(csrPath, pem);
    console.log(`Certificate signing request file "${csrPath}" created`);

    writeFileSync(keyPath, privateKey);
    console.log(`Certificate private key file "${keyPath}" created`);
}

export function generateDeviceCertificate({
    certPath,
    csrPath,
    micaCertPath,
    micaKeyPath,
    pen,
}: {
    certPath: string;
    csrPath: string;
    micaCertPath: string;
    micaKeyPath: string;
    pen: string;
}) {
    if (existsSync(certPath)) {
        console.log(
            `Device certificate file "${certPath}" exists, aborting to prevent overwrite`,
        );
        process.exit(1);
    }

    if (!existsSync(micaCertPath)) {
        console.log(`MICA certificate file "${micaCertPath}" does not exist`);
        process.exit(1);
    }

    if (!existsSync(micaKeyPath)) {
        console.log(
            `MICA certificate private key "${micaKeyPath}" does not exist`,
        );
        process.exit(1);
    }

    const csrPem = readFileSync(csrPath, 'utf8');
    const csr = rs.KJUR.asn1.csr.CSRUtil.getParam(csrPem);
    const csrPublicKey = csr.sbjpubkey;
    const micaCert = new rs.X509();
    const micaCertPem = readFileSync(micaCertPath, 'utf8');

    // the MICA certificate returned from the utility has both the MICA and the SERCA certificate chain
    // only use the MICA part of the certificate
    const micaCertOnly = micaCertPem.split('-----END CERTIFICATE-----')[0]!;

    micaCert.readCertPEM(micaCertOnly);
    const micaKeyPem = readFileSync(micaKeyPath, 'utf8');

    const hardwareTypeOid = `1.3.6.1.4.1.40732.${pen}.1`;

    const cert = new rs.KJUR.asn1.x509.Certificate({
        version: 3,
        serial: { hex: randomSerialNumberHex() },
        issuer: micaCert.getSubject(),
        notbefore: formatDateToYYMMDDhhmmssZ(new Date()),
        // hardcoded to 9999-12-31 23:59:59 UTC which server requires
        notafter: formatDateToYYMMDDhhmmssZ(new Date('9999-12-31T23:59:59Z')),
        // server requires subject must be blank
        subject: { str: '' },
        sbjpubkey: csrPublicKey,
        ext: [
            { extname: 'basicConstraints', cA: false, critical: true },
            {
                extname: 'keyUsage',
                critical: true,
                names: ['digitalSignature', 'keyAgreement'],
            },
            {
                extname: 'authorityKeyIdentifier',
                kid: micaCert.getExtSubjectKeyIdentifier().kid,
            },
            {
                extname: 'subjectAltName',
                critical: true,
                array: [
                    {
                        other: {
                            oid: SEP2_HARDWARE_MODULE_NAME,
                            value: {
                                seq: [
                                    { oid: hardwareTypeOid },
                                    // since we don't have an actual hardware, randomly generated hardware id
                                    { octstr: randomUUID() },
                                ],
                            },
                        },
                    },
                ],
            },
            {
                extname: 'certificatePolicies',
                array: DEFAULT_POLICIES.map((policyoid) => ({
                    policyoid,
                })),
            },
        ],
        sigalg: 'SHA256withECDSA',
        cakey: micaKeyPem,
    });

    // Output the PEM format certificate
    const pemCert = cert.getPEM();
    writeFileSync(certPath, pemCert);

    // append the MICA and SERCA certificates to the device certificate to make the full certificate chain
    appendFileSync(certPath, micaCertPem);
}

function formatDateToYYMMDDhhmmssZ(date: Date): string {
    const year = date.getUTCFullYear();
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0'); // Months are zero-based in JS
    const day = date.getUTCDate().toString().padStart(2, '0');
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    const seconds = date.getUTCSeconds().toString().padStart(2, '0');

    return `${year}${month}${day}${hours}${minutes}${seconds}Z`;
}

function randomSerialNumberHex() {
    const buffer = randomBytes(20);
    const num = BigInt('0x' + buffer.toString('hex'));
    return (num >> 1n).toString();
}
