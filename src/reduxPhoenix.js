import _ from 'lodash';
import dayjs from 'dayjs';
import Immutable, { Map } from 'immutable';

export const REHYDRATE = '@@REHYDRATE';

/**
 * transform state according to passed transformation
 *
 * @param {object} map transformation
 * @param {object} state State from redux
 * @return {object} Transformed state
 */
function transform(map, state) {
  const result = {};
  _.forEach(map, (value, key) => {
    if (typeof value === 'function') {
      const transformation = value(key, _.get(state, key), state);
      if (transformation.targetKey && _.has(transformation, 'targetValue')) {
        _.set(result, transformation.targetKey, transformation.targetValue);
      }
      if (_.has(transformation, 'sourceValue')) {
        _.set(result, key, transformation.sourceValue);
      }
    } else {
      _.set(result, value, _.get(state, key));
    }
  });
  return _.merge({}, state, result);
}

/**
 * get number of migrations that have been previously applied
 *
 * @param {array} appliedMigrations names of migrations that has been succesfully applied
 * @param {*} migrationsToApply list of migrations that should be run
 * @return {number} number of migrations that have been previously applied
 */
function getNumberOfAppliedMigrations(appliedMigrations, migrationsToApply) {
  const { index } = appliedMigrations.reduce((result, migrationName, index) => {
    if (result.isDifferent) {
      return result;
    }
    if (migrationsToApply[index] && migrationsToApply[index].name === migrationName) {
      return { index: result.index + 1, isDifferent: false };
    }
    return { index: result.index, isDifferent: true };
  }, { index: 0, isDifferent: false });

  return index;
}

/**
 * get functions from migrations list that should be run before rehydrating
 *
 * @param {array} appliedMigrations names of migrations that has been succesfully applied
 * @param {array} migrations list of migrations that should be run on old versions of state
 * @return {array} array of functions from migrations that should be run
 */
export function getMigrationsToRun(appliedMigrations = [], migrations) {
  const migrationsToApply = migrations.filter(migration => migration.up && migration.name);

  const numberOfAppliedMigrations = getNumberOfAppliedMigrations(appliedMigrations, migrationsToApply);

  const migrationsToRevert = appliedMigrations
    .slice(numberOfAppliedMigrations)
    .reverse()
    .map(migrationName => migrations.find(({ name }) => name === migrationName) || {})
    .filter(migration => migration.down && migration.name)
    .map(migration => migration.down);

  const migrationsToRun = migrationsToApply
    .slice(numberOfAppliedMigrations)
    .map(migration => migration.up);

  return migrationsToRevert.concat(migrationsToRun);
}

/**
 * Persist store
 *
 * @export
 * @param {object} store Redux Store
 * @param {object} config Configuration object
 * @return {Promise<object>} Persisted Store
 */
export default function persistStore(store, {
  key = 'redux',
  whitelist = null,
  blacklist = null,
  storage = window.localStorage,
  expireDate = null,
  serialize = JSON.stringify,
  deserialize = JSON.parse,
  map = {},
  disabled = false,
  throttle = 0,
  migrations = null,
} = {}) {
  return Promise.resolve(storage.getItem(key)).then(persistedJson => {
    if (disabled) {
      return store;
    }
    const persistedValue = deserialize(persistedJson);
    const { persistedState, saveDate, migrations: appliedMigrations } = persistedValue || {};
    let state = persistedState;
    if (expireDate && dayjs(saveDate).add(...expireDate).isBefore(dayjs())) {
      state = null;
    }

    let jsState = Map.isMap(state) ? state.toJS() : state;
    if (jsState && migrations) {
      const migrationsToRun = getMigrationsToRun(appliedMigrations, migrations);
      jsState = migrationsToRun.reduce((state, migration) => migration(state), state);
    }

    const persistedStateToMerge = whitelist
      ? _.omit(_.pick(jsState, whitelist), blacklist)
      : _.omit(jsState, blacklist);

    store.dispatch({
      type: REHYDRATE,
      payload: persistedStateToMerge,
    });

    const saveState = () => {
      const state = store.getState();
      let jsState = Map.isMap(state) ? state.toJS() : state;
      jsState = transform(map, jsState);


      const subset = whitelist
        ? _.omit(_.pick(jsState, whitelist), blacklist)
        : _.omit(jsState, blacklist);

      const appliedMigrations = migrations
        ? migrations.filter(migration => migration.up && migration.name).map(migration => migration.name)
        : undefined; // eslint-disable-line no-undefined

      storage.setItem(key, serialize({
        persistedState: subset,
        saveDate: dayjs().valueOf(),
        migrations: appliedMigrations,
      }));
    };

    const throttledSubscribe = _.throttle(saveState, throttle, {
      trailing: true,
    });
    store.subscribe(throttle > 0 ? throttledSubscribe : saveState);
    return store;
  });
}

/**
 * Enhancer
 *
 * @export
 * @param {function} next callback
 * @return {function} enhancer
 */
export const autoRehydrate = next => (reducer, initialState, enhancer) => {
  if (typeof initialState === 'function' && typeof enhancer === 'undefined') {
    enhancer = initialState;
    initialState = undefined; // eslint-disable-line no-undefined
  }
  function rehydrateReducer(state, action) {
    const isStateImmutable = Map.isMap(state);
    const jsState = isStateImmutable? state.toJS() : state;
    if (action.type === REHYDRATE) {
      const mergedState = _.merge({}, jsState, action.payload);
      return reducer(isStateImmutable ? Immutable.fromJS(mergedState) : mergedState, action);
    }
    return reducer(state, action);
  }
  return next(rehydrateReducer, initialState, enhancer);
};
