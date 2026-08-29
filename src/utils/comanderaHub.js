const { EventEmitter } = require('events');

const hub = new EventEmitter();
hub.setMaxListeners(200);

function channelKey(schoolId, storeId) {
  const storeKey = storeId && typeof storeId === 'object' && storeId._id
    ? String(storeId._id)
    : String(storeId || '').trim();
  return `${String(schoolId || '').trim()}:${storeKey}`;
}

function publishComanderaChange(schoolId, storeId) {
  const key = channelKey(schoolId, storeId);
  if (!schoolId || !storeId) {
    return;
  }
  hub.emit(key);
}

function subscribeComanderaChange(schoolId, storeId, listener) {
  const key = channelKey(schoolId, storeId);
  hub.on(key, listener);
  return () => hub.off(key, listener);
}

function preorderChannelKey(schoolId, storeId) {
  return `preorder:${channelKey(schoolId, storeId)}`;
}

function publishPreorderChange(schoolId, storeId) {
  const key = preorderChannelKey(schoolId, storeId);
  if (!schoolId || !storeId) {
    return;
  }
  hub.emit(key);
}

function subscribePreorderChange(schoolId, storeId, listener) {
  const key = preorderChannelKey(schoolId, storeId);
  hub.on(key, listener);
  return () => hub.off(key, listener);
}

module.exports = {
  publishComanderaChange,
  subscribeComanderaChange,
  publishPreorderChange,
  subscribePreorderChange,
};
