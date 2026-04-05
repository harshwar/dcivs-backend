/**
 * Unit Tests — Activity Logger Service
 */
const { createMockSupabase } = require('../../helpers/mockSupabase');
const { mockClient, setTableData } = createMockSupabase();
jest.mock('../../../db', () => mockClient);

const { logActivity } = require('../../../services/activityLogger');

describe('Activity Logger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should insert a log entry with user ID and action', async () => {
    setTableData('activity_logs', {});

    await logActivity({
      userId: 1,
      action: 'LOGIN_STUDENT',
      details: 'Student logged in',
      req: { headers: {}, connection: { remoteAddress: '127.0.0.1' } },
    });

    expect(mockClient.from).toHaveBeenCalledWith('activity_logs');
    const insertCall = mockClient.from('activity_logs').insert.mock.calls[0][0];
    expect(insertCall[0]).toEqual(
      expect.objectContaining({
        user_id: 1,
        action: 'LOGIN_STUDENT',
      })
    );
  });

  it('should extract IP from x-forwarded-for header', async () => {
    setTableData('activity_logs', {});

    await logActivity({
      userId: 1,
      action: 'TEST',
      details: 'test',
      req: {
        headers: { 'x-forwarded-for': '203.0.113.50, 70.41.3.18' },
        connection: { remoteAddress: '127.0.0.1' },
      },
    });

    const insertCall = mockClient.from('activity_logs').insert.mock.calls[0][0];
    expect(insertCall[0].ip_address).toBe('203.0.113.50');
  });

  it('should handle missing req gracefully', async () => {
    setTableData('activity_logs', {});

    // Should not throw
    await logActivity({
      userId: 1,
      action: 'TEST',
      details: 'no request object',
    });

    expect(mockClient.from).toHaveBeenCalledWith('activity_logs');
  });

  it('should log admin actions with adminId', async () => {
    setTableData('activity_logs', {});

    await logActivity({
      adminId: 100,
      action: 'LOGIN_ADMIN',
      details: 'Admin logged in',
      req: { headers: {}, connection: { remoteAddress: '127.0.0.1' } },
    });

    const insertCall = mockClient.from('activity_logs').insert.mock.calls[0][0];
    expect(insertCall[0].admin_id).toBe(100);
  });
});
