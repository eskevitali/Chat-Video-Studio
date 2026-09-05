import {createSerialQueue, createStudioApi} from './server/api.mjs';

export {createSerialQueue};

export const elevenLabsTtsPlugin = (environment) => {
  const handleApi = createStudioApi({
    environment,
    projectRoot: process.cwd(),
  });

  const attach = (server) => {
    server.middlewares.use(async (request, response, next) => {
      try {
        if (await handleApi(request, response)) return;
        next();
      } catch (error) {
        next(error);
      }
    });
  };

  return {
    name: 'local-elevenlabs-tts',
    configureServer: attach,
    configurePreviewServer: attach,
  };
};
