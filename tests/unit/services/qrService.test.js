/**
 * Unit Tests — QR Service
 */
jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mockQRData'),
  toBuffer: jest.fn().mockResolvedValue(Buffer.from('mockQRBuffer')),
}));

const { generateVerificationQR, generateVerificationQRBuffer } = require('../../../services/qrService');

describe('QR Service', () => {
  describe('generateVerificationQR', () => {
    it('should return a base64 data URL for a valid tokenId', async () => {
      const result = await generateVerificationQR(1);

      expect(result).toContain('data:image/png;base64');
      const qrcode = require('qrcode');
      expect(qrcode.toDataURL).toHaveBeenCalled();
    });

    it('should encode the correct verification URL', async () => {
      await generateVerificationQR(42);

      const qrcode = require('qrcode');
      const calledWith = qrcode.toDataURL.mock.calls[0][0];
      expect(calledWith).toContain('42');
    });
  });

  describe('generateVerificationQRBuffer', () => {
    it('should return a Buffer', async () => {
      const result = await generateVerificationQRBuffer(1);

      expect(Buffer.isBuffer(result)).toBe(true);
    });
  });
});
