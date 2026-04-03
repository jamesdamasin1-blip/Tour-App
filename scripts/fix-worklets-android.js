const fs = require('fs');
const path = require('path');

const targetPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-worklets',
  'android',
  'src',
  'main',
  'java',
  'com',
  'swmansion',
  'worklets',
  'WorkletsMessageQueueThreadBase.java'
);

const oldSnippet = `  @Override
  @SuppressWarnings("CallToPrintStackTrace")
  public void quitSynchronous() {
    try {
      Field mIsFinished = messageQueueThread.getClass().getDeclaredField("mIsFinished");
      mIsFinished.setAccessible(true);
      mIsFinished.set(messageQueueThread, true);
      mIsFinished.setAccessible(false);
    } catch (NoSuchFieldException | IllegalAccessException e) {
      e.printStackTrace();
    }
  }
`;

const newSnippet = `  @Override
  @SuppressWarnings("CallToPrintStackTrace")
  public void quitSynchronous() {
    try {
      Field isFinishedField = resolveFinishedField(messageQueueThread.getClass());
      isFinishedField.setAccessible(true);
      isFinishedField.set(messageQueueThread, true);
      isFinishedField.setAccessible(false);
    } catch (NoSuchFieldException | IllegalAccessException e) {
      e.printStackTrace();
    }
  }

  private Field resolveFinishedField(Class<?> threadClass) throws NoSuchFieldException {
    try {
      return threadClass.getDeclaredField("isFinished");
    } catch (NoSuchFieldException ignored) {
      return threadClass.getDeclaredField("mIsFinished");
    }
  }
`;

if (!fs.existsSync(targetPath)) {
  console.warn(`[fix-worklets-android] Skipped: ${targetPath} not found.`);
  process.exit(0);
}

const source = fs.readFileSync(targetPath, 'utf8');

if (source.includes('resolveFinishedField')) {
  console.log('[fix-worklets-android] Worklets Android patch already applied.');
  process.exit(0);
}

if (!source.includes(oldSnippet)) {
  console.warn('[fix-worklets-android] Skipped: expected source block not found.');
  process.exit(0);
}

fs.writeFileSync(targetPath, source.replace(oldSnippet, newSnippet), 'utf8');
console.log('[fix-worklets-android] Patched WorkletsMessageQueueThreadBase.java');
