import { openDB, type DBSchema } from 'idb';
import type { SelectedTake } from '../types';

interface AksaraDatabase extends DBSchema {
  selectedTakes: {
    key: string;
    value: SelectedTake;
    indexes: { sessionId: string };
  };
}

const databasePromise = openDB<AksaraDatabase>('aksara-recorder', 1, {
  upgrade(database) {
    const store = database.createObjectStore('selectedTakes', { keyPath: 'key' });
    store.createIndex('sessionId', 'sessionId');
  },
});

export async function getSelectedTake(
  sessionId: string,
  questionId: string,
): Promise<SelectedTake | undefined> {
  return (await databasePromise).get('selectedTakes', `${sessionId}:${questionId}`);
}

export async function saveSelectedTake(take: SelectedTake): Promise<void> {
  await (await databasePromise).put('selectedTakes', take);
}

export async function getSessionTakes(sessionId: string): Promise<SelectedTake[]> {
  const takes = await (await databasePromise).getAllFromIndex(
    'selectedTakes',
    'sessionId',
    sessionId,
  );
  return takes.sort((left, right) => left.questionIndex - right.questionIndex);
}

export async function removeSessionData(sessionId: string): Promise<void> {
  const database = await databasePromise;
  const transaction = database.transaction('selectedTakes', 'readwrite');
  const index = transaction.store.index('sessionId');
  let cursor = await index.openCursor(sessionId);

  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }

  await transaction.done;
}
