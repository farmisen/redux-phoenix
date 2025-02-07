import persistStore, { autoRehydrate, REHYDRATE, getMigrationsToRun } from 'reduxPhoenix';
import dayjs from 'dayjs';
import sinon from 'sinon';

describe('persistStore', () => {
  describe('autoRehydrate', () => {
    it('should pass second and third parameter', () => {
      const next = jest.fn();
      const initialReducer = jest.fn();
      const initialState = {};
      const enhancer = 'enhancer';
      autoRehydrate(next)(initialReducer, initialState, enhancer);
      expect(next.mock.calls[0][1]).toBe(initialState);
      expect(next.mock.calls[0][2]).toEqual(enhancer);
    });

    it('should return correct reducer working with REHYDRATE action', () => {
      const next = jest.fn();
      const initialReducer = jest.fn();
      const initialState = {};
      const enhancer = 'enhancer';
      autoRehydrate(next)(initialReducer, initialState, enhancer);
      const action = {
        type: REHYDRATE,
        payload: { state: 'persistedState' },
      };
      const initialStateToReducer = { state: 'initialState', otherField: 'someData' };
      next.mock.calls[0][0](initialStateToReducer, action);
      expect(initialReducer.mock.calls[0][0]).toEqual({ otherField: 'someData', state: 'persistedState' });
      expect(initialReducer.mock.calls[0][1]).toBe(action);
    });

    it('should return correct reducer working with other actions', () => {
      const next = jest.fn();
      const initialReducer = jest.fn();
      const initialState = {};
      const enhancer = 'enhancer';
      autoRehydrate(next)(initialReducer, initialState, enhancer);
      const action = {
        type: 'OTHER_ACTION',
      };
      const initialStateToReducer = { state: 'initialState', otherField: 'someData' };
      next.mock.calls[0][0](initialStateToReducer, action);
      expect(initialReducer.mock.calls[0][0]).toEqual(initialStateToReducer);
      expect(initialReducer.mock.calls[0][1]).toBe(action);
    });
  });

  describe('persistStore', () => {
    let clock;
    beforeAll(() => {
      clock = sinon.useFakeTimers();
    });
    afterAll(() => {
      clock.restore();
    });

    it('should return passed store', () => {
      const store = {
        dispatch: jest.fn(),
        subscribe: jest.fn(),
      };
      const storage = {
        getItem: () => Promise.resolve(JSON.stringify({ persistedState: { state: 'persistedState' } })),
        setItem: jest.fn(),
      };
      const returnedStore = persistStore(store, { storage });
      return returnedStore.then(returnedStore => {
        expect(returnedStore).toBe(store);
      });
    });

    it('should trigger store methods dispatch and subscribe', () => {
      const store = {
        dispatch: jest.fn(),
        subscribe: jest.fn(),
      };
      const storage = {
        getItem: () => Promise.resolve(JSON.stringify({ persistedState: { state: 'persistedState' } })),
        setItem: jest.fn(),
      };
      return persistStore(store, { storage }).then(store => {
        expect(store.dispatch.mock.calls[0][0]).toEqual({
          type: REHYDRATE,
          payload: { state: 'persistedState' },
        });
        expect(store.subscribe).toHaveBeenCalled();
      });
    });

    it('should trigger store methods dispatch with state from not async storage', () => {
      const store = {
        dispatch: jest.fn(),
        subscribe: jest.fn(),
      };
      const storage = {
        getItem: () => JSON.stringify({ persistedState: { state: 'persistedState' } }),
        setItem: jest.fn(),
      };
      return persistStore(store, { storage }).then(store => {
        expect(store.dispatch.mock.calls[0][0]).toEqual({
          type: REHYDRATE,
          payload: { state: 'persistedState' },
        });
      });
    });

    it('should save state after any action', () => {
      const store = {
        dispatch: jest.fn(),
        subscribe: jest.fn(),
        getState: () => ({ actualState: 'actualState' }),
      };
      const storage = {
        getItem: () => Promise.resolve(JSON.stringify({ persistedState: { state: 'persistedState' } })),
        setItem: jest.fn(),
      };
      return persistStore(store, { storage }).then(store => {
        store.subscribe.mock.calls[0][0]();
        expect(storage.setItem.mock.calls[0][0]).toEqual('redux');
        expect(JSON.parse(storage.setItem.mock.calls[0][1])).toEqual({
          persistedState: {
            actualState: 'actualState',
          },
          saveDate: dayjs().valueOf(),
        });
      });
    });

    it('should save state after any action on passed key', () => {
      const store = {
        dispatch: jest.fn(),
        subscribe: jest.fn(),
        getState: () => ({ actualState: 'actualState' }),
      };
      const storage = {
        getItem: () => Promise.resolve(JSON.stringify({ persistedState: { state: 'persistedState' } })),
        setItem: jest.fn(),
      };
      return persistStore(store, { storage, key: 'testKey' }).then(store => {
        store.subscribe.mock.calls[0][0]();
        expect(storage.setItem.mock.calls[0][0]).toEqual('testKey');
        expect(JSON.parse(storage.setItem.mock.calls[0][1])).toEqual({
          persistedState: {
            actualState: 'actualState',
          },
          saveDate: dayjs().valueOf(),
        });
      });
    });

    it('should save only selected fields based on whitelist and blacklist', () => {
      const store = {
        dispatch: jest.fn(),
        subscribe: jest.fn(),
        getState: () => ({
          whitelisted: { whitelistedField: 'should be saved', blacklistedField: 'should not be saved' },
          blacklisted: { field: 'should not be saved' },
        }),
      };
      const storage = {
        getItem: () => Promise.resolve(JSON.stringify({ persistedState: { state: 'persistedState' } })),
        setItem: jest.fn(),
      };
      return persistStore(store, { storage, whitelist: ['whitelisted'], blacklist: ['whitelisted.blacklistedField'] }).then(store => {
        store.subscribe.mock.calls[0][0]();
        expect(storage.setItem.mock.calls[0][0]).toEqual('redux');
        expect(JSON.parse(storage.setItem.mock.calls[0][1])).toEqual({
          persistedState: {
            whitelisted: { whitelistedField: 'should be saved' },
          },
          saveDate: dayjs().valueOf(),
        });
      });
    });

    it('should not restore old state', () => {
      const store = {
        dispatch: jest.fn(),
        subscribe: jest.fn(),
        getState: () => ({}),
      };
      const storage = {
        getItem: () => Promise.resolve(JSON.stringify({ persistedState: { state: 'persistedState' }, saveDate: 0 })),
        setItem: jest.fn(),
      };
      clock.tick(2000);
      return persistStore(store, { storage, expireDate: [1, 'seconds'] }).then(store => {
        expect(store.dispatch.mock.calls[0][0]).toEqual({
          type: REHYDRATE,
          payload: {},
        });
        expect(store.subscribe).toHaveBeenCalled();
      });
    });

    it('should use passed serialize and deserialize function', () => {
      const store = {
        dispatch: jest.fn(),
        subscribe: jest.fn(),
        getState: () => ({ actualState: 'actualState' }),
      };
      const storage = {
        getItem: () => Promise.resolve(JSON.stringify({ persistedState: { state: 'persistedState' } })),
        setItem: jest.fn(),
      };
      return persistStore(store, {
        storage,
        serialize: () => 'serialized',
        deserialize: () => ({ persistedState: { state: 'deserialized' } }),
      }).then(store => {
        expect(store.dispatch.mock.calls[0][0]).toEqual({
          type: REHYDRATE,
          payload: { state: 'deserialized' },
        });
        store.subscribe.mock.calls[0][0]();
        expect(storage.setItem.mock.calls[0][0]).toEqual('redux');
        expect(storage.setItem.mock.calls[0][1]).toEqual('serialized');
      });
    });

    it('should map keys based on passed dictionary with strings', () => {
      const store = {
        dispatch: jest.fn(),
        subscribe: jest.fn(),
        getState: () => (
          {
            state:
            {
              keyToReplace: 'test data',
              keyToLeave: 'other data',
              newReplacedKey: 'old data',
            },
          }),
      };
      const storage = {
        getItem: () => Promise.resolve(JSON.stringify({ persistedState: { state: 'persistedState' } })),
        setItem: jest.fn(),
      };
      const map = { 'state.keyToReplace': 'state.newReplacedKey' };
      return persistStore(store, { storage, map }).then(store => {
        store.subscribe.mock.calls[0][0]();
        expect(storage.setItem.mock.calls[0][0]).toEqual('redux');
        expect(JSON.parse(storage.setItem.mock.calls[0][1])).toEqual({
          persistedState: {
            state: {
              keyToReplace: 'test data',
              keyToLeave: 'other data',
              newReplacedKey: 'test data',
            },
          },
          saveDate: dayjs().valueOf(),
        });
      });
    });

    it('should map keys based on passed dictionary with functions', () => {
      const store = {
        dispatch: jest.fn(),
        subscribe: jest.fn(),
        getState: () => (
          {
            state:
            {
              keyToReplace: 'test data',
              keyToLeave: 'other data',
              newReplacedKey: 'old data',
            },
          }),
      };
      const storage = {
        getItem: () => Promise.resolve(JSON.stringify({ persistedState: { state: 'persistedState' } })),
        setItem: jest.fn(),
      };
      function mapKeys(oldKey, value, state) {
        return {
          targetKey: 'state.newReplacedKey',
          targetValue: `${oldKey} - ${value}`,
          sourceValue: `value for target - ${state.state.keyToLeave}`,
        };
      }
      const map = { 'state.keyToReplace': mapKeys };
      return persistStore(store, { storage, map }).then(store => {
        store.subscribe.mock.calls[0][0]();
        expect(storage.setItem.mock.calls[0][0]).toEqual('redux');
        expect(JSON.parse(storage.setItem.mock.calls[0][1])).toEqual({
          persistedState: {
            state: {
              keyToReplace: 'value for target - other data',
              keyToLeave: 'other data',
              newReplacedKey: 'state.keyToReplace - test data',
            },
          },
          saveDate: dayjs().valueOf(),
        });
      });
    });

    it('should not save anything when is disabled', () => {
      const store = {
        dispatch: jest.fn(),
        subscribe: jest.fn(),
        getState: () => ({}),
      };
      const storage = {
        getItem: () => Promise.resolve(JSON.stringify({ persistedState: { state: 'persistedState' } })),
        setItem: jest.fn(),
      };
      return persistStore(store, { storage, disabled: true }).then(store => {
        expect(store.dispatch).not.toHaveBeenCalled();
        expect(store.subscribe).not.toHaveBeenCalled();
        expect(storage.setItem).not.toHaveBeenCalled();
      });
    });

    it('should call setItem once if if two dispatch is called in the throttle time', () => {
      const store = {
        dispatch: jest.fn(),
        subscribe: jest.fn(),
        getState: () => ({}),
      };
      const storage = {
        getItem: () =>
          Promise.resolve(
            JSON.stringify({ persistedState: { state: 'persistedState' } }),
          ),
        setItem: jest.fn(),
      };
      return persistStore(store, { storage, throttle: 100 }).then(store => {
        store.dispatch();
        store.dispatch();
        setTimeout(() => {
          expect(storage.setItem).toHaveBeenCalledTimes(1);
        }, 200);
      });
    });

    it('should call setItem twice if if two dispatch is called outside the throttle time', () => {
      const store = {
        dispatch: jest.fn(),
        subscribe: jest.fn(),
        getState: () => ({}),
      };
      const storage = {
        getItem: () =>
          Promise.resolve(
            JSON.stringify({ persistedState: { state: 'persistedState' } }),
          ),
        setItem: jest.fn(),
      };
      return persistStore(store, { storage, throttle: 100 }).then(store => {
        store.dispatch();
        setTimeout(() => {
          expect(storage.setItem).toHaveBeenCalledTimes(1);
          store.dispatch();
          expect(storage.setItem).toHaveBeenCalledTimes(2);
        }, 200);
      });
    });

    it('should run migrations that are missing in the persistedState', () => {
      const store = {
        dispatch: jest.fn(),
        subscribe: jest.fn(),
      };
      const storage = {
        getItem: () => JSON.stringify({ persistedState: { state: 'persistedState' }, migrations: ['001-initial-migration'] }),
        setItem: jest.fn(),
      };
      const migrations = [
        {
          name: '001-initial-migration',
          up: state => Object.assign({}, state, { newField: 'newFieldValue' }),
          down: state => state,
        },
        {
          name: '002-missing-migration',
          up: state => Object.assign({}, state, { anotherNewField: 'newValue' }),
          down: state => state,
        },
      ];

      return persistStore(store, { storage, migrations }).then(store => {
        expect(store.dispatch.mock.calls[0][0]).toEqual({
          type: REHYDRATE,
          payload: { state: 'persistedState', anotherNewField: 'newValue' },
        });
      });
    });

    it('should save applied migrations', () => {
      const store = {
        dispatch: jest.fn(),
        subscribe: jest.fn(),
        getState: () => ({ actualState: 'actualState' }),
      };
      const storage = {
        getItem: () => Promise.resolve(JSON.stringify({ persistedState: { state: 'persistedState' } })),
        setItem: jest.fn(),
      };
      const migrations = [
        {
          name: '001-initial-migration',
          up: state => state,
          down: state => state,
        },
        {
          name: '002-reverted',
          down: state => state,
        },
        {
          name: '003-new-migration',
          up: state => state,
          down: state => state,
        },
      ];

      return persistStore(store, { storage, migrations }).then(store => {
        store.subscribe.mock.calls[0][0]();
        expect(storage.setItem.mock.calls[0][0]).toEqual('redux');
        expect(JSON.parse(storage.setItem.mock.calls[0][1])).toEqual({
          persistedState: {
            actualState: 'actualState',
          },
          saveDate: dayjs().valueOf(),
          migrations: ['001-initial-migration', '003-new-migration'],
        });
      });
    });
  });

  describe('getMigrationsToRun', () => {
    it('should return an empty array when all migrations has been applied', () => {
      const migrations = [
        {
          name: '001-initial',
          up: state => state,
          down: state => state,
        },
      ];
      const appliedMigrations = ['001-initial'];

      const migrationsToRun = getMigrationsToRun(appliedMigrations, migrations);

      expect(migrationsToRun).toEqual([]);
    });

    it('should return an array with one migration that has been added', () => {
      const migrations = [
        {
          name: '001-first',
          up: 'Apply first migration',
          down: 'Revert first migration',
        },
        {
          name: '002-second',
          up: 'Apply the second migration',
          down: 'Revert the second migration',
        },
      ];
      const appliedMigrations = ['001-first'];

      const migrationsToRun = getMigrationsToRun(appliedMigrations, migrations);

      expect(migrationsToRun).toEqual(['Apply the second migration']);
    });

    it('should return an array with one migration that has been reverted', () => {
      const migrations = [
        {
          name: '001-initial',
          up: 'Apply initial migration',
          down: 'Revert initial migration',
        },
        {
          name: '002-reverted',
          down: 'Revert the second migration',
        },
      ];
      const appliedMigrations = ['001-initial', '002-reverted'];

      const migrationsToRun = getMigrationsToRun(appliedMigrations, migrations);

      expect(migrationsToRun).toEqual(['Revert the second migration']);
    });

    it('should return an array with combined migrations beginning from one that has been reverted', () => {
      const migrations = [
        {
          name: '001-initial',
          up: 'Apply initial migration',
          down: 'Revert initial migration',
        },
        {
          name: '002-reverted',
          down: 'Revert the second migration',
        },
        {
          name: '003-applied-previously',
          up: 'Apply the third migration',
          down: 'Revert the third migration',
        },
      ];
      const appliedMigrations = ['001-initial', '002-reverted', '003-applied-previously'];

      const migrationsToRun = getMigrationsToRun(appliedMigrations, migrations);

      expect(migrationsToRun).toEqual(['Revert the third migration', 'Revert the second migration', 'Apply the third migration']);
    });

    it('should return an empty array when reverted migrations has not been applied', () => {
      const migrations = [
        {
          name: '001-initial',
          up: 'Apply initial migration',
          down: 'Revert initial migration',
        },
        {
          name: '002-reverted',
          down: 'Revert the second migration',
        },
        {
          name: '003-applied-previously',
          up: 'Apply the third migration',
          down: 'Revert the third migration',
        },
      ];
      const appliedMigrations = ['001-initial', '003-applied-previously'];

      const migrationsToRun = getMigrationsToRun(appliedMigrations, migrations);

      expect(migrationsToRun).toEqual([]);
    });
  });
});
