import { openDatabase, ChatRepository, CharacterRepository, PersonaRepository, ProviderRepository, SceneRepository, ScriptRepository, WorldInfoRepository } from '@roleplay/db';
import type { AppConfig } from './config.js';
import { SecretBox } from './crypto.js';
import { GenerationManager } from './generation.js';
import type { AppContext } from './types.js';

const SAMPLE_CHARACTER = {
  name: '林晚',
  description: '旧城「夜航」咖啡馆的老板，二十七岁。习惯在雨夜留一盏灯，记得每个熟客的口味。',
  personality: '克制、敏锐，偶尔毒舌；对熟人有不动声色的照顾。',
  scenario: '雨夜的旧城咖啡馆，店里只剩你和吧台后的林晚。窗外的雨顺着玻璃往下淌。',
  firstMessage: '风铃响了一声。\n\n林晚从吧台后抬起头，目光在你身上停了一瞬，随后把一杯还冒着热气的咖啡推到对面的位置。\n\n「来了。」她说，「坐吧，雨一时半会儿停不了。」',
  systemPrompt: '称呼用户为「你」。不要替用户做决定，不要描述用户的动作或心理。',
};

export function createContext(config: AppConfig): AppContext {
  const db = openDatabase(config.dbFile);
  const repos = {
    providers: new ProviderRepository(db),
    characters: new CharacterRepository(db),
    chats: new ChatRepository(db),
    scenes: new SceneRepository(db),
    personas: new PersonaRepository(db),
    scripts: new ScriptRepository(db),
    worldInfo: new WorldInfoRepository(db),
  };
  const secrets = new SecretBox(config.masterKeyPath);

  let scripts = repos.scripts.list();
  if (scripts.length === 0) {
    const script = repos.scripts.create({
      name: '雨夜咖啡馆',
      description: '旧城「夜航」咖啡馆，雨夜。店里只剩唱机、吧台后的林晚，和刚推门进来的你。',
      opening: '',
    });
    scripts = [script];
    for (const character of repos.characters.list().filter((item) => !item.scriptId)) {
      repos.characters.update(character.id, { scriptId: script.id });
    }
  }
  if (repos.characters.list().length === 0) {
    repos.characters.create({ ...SAMPLE_CHARACTER, scriptId: scripts[0]?.id ?? null });
  }

  return {
    config,
    db,
    repos,
    secrets,
    generations: new GenerationManager(),
  };
}
