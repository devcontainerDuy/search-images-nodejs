// Centralized runtime settings (singleton)
let augmentationEnabled = true;
let robustRecoveryMode = false;

function getAugmentationEnabled() {
  return augmentationEnabled;
}

function setAugmentationEnabled(enabled) {
  augmentationEnabled = !!enabled;
  return augmentationEnabled;
}

module.exports = {
  getAugmentationEnabled,
  setAugmentationEnabled,
  getRobustRecoveryMode: () => robustRecoveryMode,
  setRobustRecoveryMode: (enabled) => (robustRecoveryMode = !!enabled),
};
