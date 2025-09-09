// Centralized runtime settings (singleton)
let augmentationEnabled = true;

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
};

