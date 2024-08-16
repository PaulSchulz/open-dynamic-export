import { generateDeviceCertificate } from '../src/cert';
import { getConfig } from '../src/config';

const config = getConfig();

generateDeviceCertificate({
    certPath: 'cert.pem',
    csrPath: 'cert_req.csr',
    micaCertPath: 'mica_certificate.pem',
    micaKeyPath: 'mica_key.pem',
    pen: config.sep2.pen.toString(),
});
