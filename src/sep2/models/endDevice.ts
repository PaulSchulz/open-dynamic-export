import { assertString } from '../helpers/assert';
import { stringToBoolean } from '../helpers/boolean';
import { stringIntToDate } from '../helpers/date';
import { parseLinkXmlObject, type Link } from './link';
import {
    parseSubscribableResourceXmlObject,
    type SubscribableResource,
} from './subscribableResource';

export type EndDevice = {
    lFDI?: string;
    sFDI: string;
    changedTime: Date;
    enabled: boolean;
    derListLink: Link | undefined;
    logEventListLink: Link | undefined;
    registrationLink: Link | undefined;
    functionSetAssignmentsListLink: Link | undefined;
    subscriptionListLink: Link | undefined;
} & SubscribableResource;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseEndDeviceXml(xml: any): EndDevice {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
    const object = xml['EndDevice'];
    /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

    return parseEndDeviceObject(object);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseEndDeviceObject(endDeviceObject: any): EndDevice {
    /* eslint-disable @typescript-eslint/no-unsafe-member-access */
    const subscribeableResource =
        parseSubscribableResourceXmlObject(endDeviceObject);
    const lFDI = endDeviceObject['lFDI']
        ? assertString(endDeviceObject['lFDI'][0])
        : undefined;
    const logEventListLink = parseLinkXmlObject(
        endDeviceObject['LogEventListLink'][0],
    );
    const sFDI = assertString(endDeviceObject['sFDI'][0]);
    const changedTime = stringIntToDate(
        assertString(endDeviceObject['changedTime'][0]),
    );
    const registrationLink = parseLinkXmlObject(
        endDeviceObject['RegistrationLink'][0],
    );
    const enabled = endDeviceObject['enabled']
        ? stringToBoolean(assertString(endDeviceObject['enabled'][0]))
        : true;
    const derListLink = endDeviceObject['DERListLink']
        ? parseLinkXmlObject(endDeviceObject['DERListLink'][0])
        : undefined;

    const functionSetAssignmentsListLink = endDeviceObject[
        'FunctionSetAssignmentsListLink'
    ]
        ? parseLinkXmlObject(
              endDeviceObject['FunctionSetAssignmentsListLink'][0],
          )
        : undefined;
    const subscriptionListLink = endDeviceObject['SubscriptionListLink']
        ? parseLinkXmlObject(endDeviceObject['SubscriptionListLink'][0])
        : undefined;
    /* eslint-enable @typescript-eslint/no-unsafe-member-access */

    return {
        ...subscribeableResource,
        lFDI,
        logEventListLink,
        sFDI,
        changedTime,
        registrationLink,
        enabled,
        derListLink,
        functionSetAssignmentsListLink,
        subscriptionListLink,
    };
}
