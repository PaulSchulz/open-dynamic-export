import type { Logger } from 'pino';
import { logger as pinoLogger } from '../../helpers/logger';
import EventEmitter from 'node:events';
import type {
    SiteMonitoringSample,
    SiteMonitoringSampleData,
} from './siteMonitoringSample';

export abstract class SiteMonitoringPollerBase extends EventEmitter<{
    data: [
        {
            siteMonitoringSample: SiteMonitoringSample;
        },
    ];
}> {
    protected logger: Logger;
    private pollingIntervalMs;

    constructor({
        meterName,
        pollingIntervalMs,
    }: {
        meterName: string;
        // how frequently at most to poll the site monitoring data
        pollingIntervalMs: number;
    }) {
        super();

        this.pollingIntervalMs = pollingIntervalMs;
        this.logger = pinoLogger.child({
            module: 'SiteMonitoringPollerBase',
            meterName,
        });
    }

    abstract getSiteMonitoringSampleData(): Promise<SiteMonitoringSampleData>;

    protected async startPolling() {
        const start = performance.now();
        const now = new Date();

        try {
            this.logger.trace('generating site monitoring sample');

            const siteMonitoringSample = {
                date: now,
                ...(await this.getSiteMonitoringSampleData()),
            };

            this.logger.trace(
                { siteMonitoringSample },
                'generated site monitoring sample',
            );

            const end = performance.now();

            this.logger.trace({ duration: end - start }, 'run time');

            this.emit('data', {
                siteMonitoringSample,
            });
        } catch (error) {
            this.logger.error({ error }, 'Failed to poll site monitoring data');
        } finally {
            // this loop must meet sampling requirements and dynamic export requirements
            // Energex SEP2 Client Handbook specifies "As per the standard, samples should be taken every 200ms (10 cycles). If not capable of sampling this frequently, 1 second samples may be sufficient."
            // SA Power Networks – Dynamic Exports Utility Interconnection Handbook specifies "Average readings shall be generated by sampling at least every 5 seconds. For example, sample rates of less than 5 seconds are permitted."
            const end = performance.now();
            const duration = end - start;

            // we don't want to run this loop any more frequently than the polling interval to prevent overloading the connection
            const delay = Math.max(this.pollingIntervalMs - duration, 0);

            setTimeout(() => {
                void this.startPolling();
            }, delay);
        }
    }
}
