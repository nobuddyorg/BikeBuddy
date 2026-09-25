'use strict';

const { app } = require('@azure/functions');

describe('functionsApp', () => {
  it('turns on HTTP streaming, so an upload body is never buffered whole (#550)', () => {
    const setup = vi.spyOn(app, 'setup').mockImplementation(() => {});
    try {
      delete require.cache[require.resolve('./functionsApp')];
      const functionsApp = require('./functionsApp');

      expect(setup).toHaveBeenCalledWith({ enableHttpStream: true });
      expect(functionsApp.app).toBe(app);
    } finally {
      setup.mockRestore();
    }
  });
});
