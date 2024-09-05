import mqtt from 'mqtt';
import type { InverterControlLimit } from '../../coordinator/helpers/inverterController';
import type { LimiterType } from '../../coordinator/helpers/limiter';
import type { Config } from '../../helpers/config';
import { writeControlLimit } from '../../helpers/influxdb';
import { z } from 'zod';
import type { Logger } from 'pino';
import { logger as pinoLogger } from '../../helpers/logger';

type MqttLimiterConfig = NonNullable<Config['limiters']['mqtt']>;

export class MqttLimiter implements LimiterType {
    private client: mqtt.MqttClient;
    private cachedMessage: z.TypeOf<typeof mqttSchema> | null = null;
    private logger: Logger;

    constructor({ config }: { config: MqttLimiterConfig }) {
        this.logger = pinoLogger.child({ module: 'MqttLimiter' });

        this.client = mqtt.connect(`mqtt://${config.host}`, {
            username: config.username,
            password: config.password,
        });

        this.client.on('connect', () => {
            this.client.subscribe(config.topic);
        });

        this.client.on('message', (_topic, message) => {
            const data = message.toString();

            const result = mqttSchema.safeParse(JSON.parse(data));

            if (!result.success) {
                this.logger.error({ message: 'Invalid MQTT message', data });
                return;
            }

            this.cachedMessage = result.data;
        });
    }

    getInverterControlLimit(): InverterControlLimit {
        const limit = {
            opModConnect: this.cachedMessage?.opModConnect,
            opModEnergize: this.cachedMessage?.opModEnergize,
            opModExpLimW: this.cachedMessage?.opModExpLimW,
            opModGenLimW: this.cachedMessage?.opModGenLimW,
        };

        writeControlLimit({ limit, name: 'mqtt' });

        return limit;
    }
}

const mqttSchema = z.object({
    opModConnect: z.boolean().optional(),
    opModEnergize: z.boolean().optional(),
    opModExpLimW: z.number().optional(),
    opModGenLimW: z.number().optional(),
});