import 'reflect-metadata';
import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp, setupSwagger, swaggerEnabled } from './bootstrap';
import { getConfig } from './config/env';

async function main(): Promise<void> {
  // Valide la configuration avant tout : échec immédiat et lisible.
  const config = getConfig();

  const app = await NestFactory.create(AppModule, {
    // Logs JSON structurés en production, lisibles en développement.
    logger: new ConsoleLogger({ json: config.NODE_ENV === 'production' }),
    bodyParser: true,
  });
  configureApp(app, config);
  if (swaggerEnabled(config)) setupSwagger(app);

  await app.listen(config.PORT);
  const logger = new Logger('Bootstrap');
  logger.log(`API prête : http://localhost:${config.PORT}/api/v1`);
  if (swaggerEnabled(config)) logger.log(`Documentation : http://localhost:${config.PORT}/api/docs`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
