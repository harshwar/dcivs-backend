/**
 * Mock Supabase Client Builder
 * Provides a chainable mock that mirrors the real Supabase JS client API.
 * Each query chain method returns `this` to allow chaining.
 * Resolve values are set via `_setResult(data, error)` or `_setCount(n)`.
 */

function createMockQueryBuilder(defaultData = null, defaultError = null) {
  const builder = {
    _data: defaultData,
    _error: defaultError,
    _count: null,

    /** Override the data / error returned at the end of the chain */
    _setResult(data, error = null) {
      builder._data = data;
      builder._error = error;
      return builder;
    },
    _setCount(n) {
      builder._count = n;
      return builder;
    },

    // --- Chainable methods ---
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),

    // --- Terminal methods ---
    single: jest.fn().mockImplementation(() =>
      Promise.resolve({ data: builder._data, error: builder._error })
    ),
    maybeSingle: jest.fn().mockImplementation(() =>
      Promise.resolve({ data: builder._data, error: builder._error })
    ),

    // When no terminal is called, the builder itself resolves via `then`
    then: jest.fn().mockImplementation((resolve) =>
      resolve({
        data: builder._data,
        error: builder._error,
        count: builder._count,
      })
    ),
  };

  // Make all chainable methods return the builder itself
  return builder;
}

/**
 * Create a full mock Supabase client.
 * Usage:
 *   const { mockClient, setTableData } = createMockSupabase();
 *   jest.mock('../db', () => mockClient);
 *   setTableData('students', { id: 1, email: 'test@test.com' });
 */
function createMockSupabase() {
  const tableBuilders = {};

  const mockClient = {
    from: jest.fn((tableName) => {
      if (!tableBuilders[tableName]) {
        tableBuilders[tableName] = createMockQueryBuilder();
      }
      return tableBuilders[tableName];
    }),
  };

  /**
   * Convenience: pre-set data for a specific table.
   * The next query to that table will return this data.
   */
  function setTableData(tableName, data, error = null) {
    if (!tableBuilders[tableName]) {
      tableBuilders[tableName] = createMockQueryBuilder(data, error);
    } else {
      tableBuilders[tableName]._setResult(data, error);
    }
    return tableBuilders[tableName];
  }

  function setTableCount(tableName, count) {
    if (!tableBuilders[tableName]) {
      tableBuilders[tableName] = createMockQueryBuilder();
    }
    tableBuilders[tableName]._setCount(count);
    return tableBuilders[tableName];
  }

  /** Get the underlying builder for ad-hoc assertions */
  function getBuilder(tableName) {
    return tableBuilders[tableName];
  }

  /** Reset all table mocks between tests */
  function resetAll() {
    Object.keys(tableBuilders).forEach((k) => delete tableBuilders[k]);
    mockClient.from.mockClear();
  }

  return { mockClient, setTableData, setTableCount, getBuilder, resetAll };
}

module.exports = { createMockSupabase, createMockQueryBuilder };
