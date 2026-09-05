import React, {useEffect, useMemo, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Player, type PlayerRef} from '@remotion/player';
import {ChatVideo} from './remotion/ChatVideo';
import {compileTimeline} from './domain/timeline';
import {prototypeProject} from './data/prototype-project';
import type {AudioTake, ElevenLabsModelId, ElevenLabsSettings, MessageImage, ProjectTheme, PrototypeMessage, PrototypeProject, ThemePresetId, VideoSettings} from './domain/types';
import {createApproximateWordTimings, estimateSpeechDuration} from './domain/words';
import {importedChatToProject, parseMarkdownChat} from './import/markdown';
import {createEditorSnapshot, parseEditorSnapshot, serializeEditorSnapshot} from './persistence/editor-snapshot';
import {defaultAppSettings, loadAppSettings, parseAppSettings, saveAppSettings, serializeAppSettings, type AppSettings} from './persistence/app-settings';
import {LoginScreen, type Session} from './login';
import {defaultProjectTheme, themePresets} from './remotion/theme';
import {defaultVideoSettings, getVideoDimensions, resolveVideoSettings, videoDimensions} from './domain/video';
import {moveMessageBy, reorderMessages} from './domain/messages';
import './styles.css';

const STORAGE_KEY = 'chat-video-studio.editor-snapshot.v1';

type RenderJob = {
  id: string;
  status: 'rendering' | 'complete' | 'failed';
  url?: string;
  error?: string;
};

type MobilePanel = 'script' | 'preview' | 'timeline' | 'settings';

type ProjectMeta = {id: string; title: string; durationMs: number; updatedAt: string};

const loadInitialProject = (): {project: PrototypeProject; notice: string} => {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return {
        project: parseEditorSnapshot(saved).project,
        notice: 'Проект восстановлен из автосохранения.',
      };
    }
  } catch {
    // Недоступное или повреждённое локальное хранилище не должно блокировать редактор.
  }
  return {project: prototypeProject, notice: 'Демонстрационный проект с двумя аудиодублями.'};
};

const safeFileName = (title: string) => {
  const normalized = title.trim().replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '');
  return normalized || 'chat-video-project';
};

const getImageDimensions = (file: File) => new Promise<{width: number; height: number}>((resolvePromise, reject) => {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(url);
    resolvePromise({width: image.naturalWidth, height: image.naturalHeight});
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error('Не удалось прочитать изображение.'));
  };
  image.src = url;
});

const App: React.FC<{username: string; onLogout: () => void; cloudSettings: boolean}> = ({username, onLogout, cloudSettings}) => {
  const [initial] = useState(loadInitialProject);
  const [project, setProject] = useState<PrototypeProject>(initial.project);
  const [notice, setNotice] = useState(initial.notice);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [uploadingImage, setUploadingImage] = useState<Record<string, boolean>>({});
  const [renderJob, setRenderJob] = useState<RenderJob | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string>(() => initial.project.messages[0]?.id ?? '');
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [timelineFit, setTimelineFit] = useState(true);
  const [draggedMessageId, setDraggedMessageId] = useState('');
  const [dropTargetId, setDropTargetId] = useState('');
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('script');
  const [settings, setSettings] = useState<AppSettings>(cloudSettings ? defaultAppSettings : loadAppSettings);
  const [settingsHydrated, setSettingsHydrated] = useState(!cloudSettings);
  const [showApiKey, setShowApiKey] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [projectList, setProjectList] = useState<ProjectMeta[]>([]);
  const [workspaceReady, setWorkspaceReady] = useState(!cloudSettings);
  const [maxProjects, setMaxProjects] = useState(2);
  const fileInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const player = useRef<PlayerRef>(null);
  const skipNextSave = useRef(true);
  const timeline = useMemo(() => compileTimeline(project), [project]);
  const selectedMessage = timeline.messages.find((message) => message.id === selectedMessageId) ?? timeline.messages[0];
  const selectedMessageIndex = selectedMessage
    ? timeline.messages.findIndex((message) => message.id === selectedMessage.id)
    : -1;
  const video = resolveVideoSettings(project.video);
  const elevenLabs = project.elevenLabs ?? {modelId: 'eleven_multilingual_v2'};
  const dimensions = getVideoDimensions(project.video);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, serializeEditorSnapshot(project));
    } catch {
      setError('Автосохранение недоступно: локальное хранилище браузера переполнено или заблокировано.');
    }
  }, [project]);

  useEffect(() => {
    if (!cloudSettings) {
      setSettingsHydrated(true);
      return;
    }
    let cancelled = false;
    fetch('/api/settings')
      .then(async (response) => {
        if (!response.ok) throw new Error('settings');
        return response.json();
      })
      .then((remote) => {
        if (cancelled) return;
        const fromAccount = parseAppSettings(JSON.stringify(remote));
        const local = loadAppSettings();
        setSettings(fromAccount.apiKey || fromAccount.userVoiceId ? fromAccount : local);
        setSettingsHydrated(true);
      })
      .catch(() => {
        if (!cancelled) {
          setSettings(loadAppSettings());
          setSettingsHydrated(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [cloudSettings]);

  useEffect(() => {
    if (!settingsHydrated) return;
    try {
      saveAppSettings(settings);
    } catch {
      setError('Не удалось сохранить настройки ElevenLabs в браузере.');
    }
    if (!cloudSettings) return;
    const timer = window.setTimeout(() => {
      void fetch('/api/settings', {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: serializeAppSettings(settings),
      }).catch(() => {
        setError('Не удалось сохранить настройки ElevenLabs для учётки Lokvita.');
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [settings, settingsHydrated, cloudSettings]);

  useEffect(() => {
    if (!cloudSettings) {
      setWorkspaceReady(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const listing = await fetch('/api/projects').then((response) => response.json());
      if (cancelled) return;
      setMaxProjects(listing.maxProjects || 2);
      const items = (listing.projects || []) as ProjectMeta[];
      setProjectList(items);
      const latest = [...items].sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))[0];
      if (latest) {
        const packed = await fetch(`/api/projects/${latest.id}`).then((response) => response.json());
        if (cancelled) return;
        skipNextSave.current = true;
        setProjectId(latest.id);
        setProject(packed.snapshot.project);
        setSelectedMessageId(packed.snapshot.project.messages[0]?.id ?? '');
        setNotice(`Открыт проект «${packed.snapshot.project.title}». Слотов ${items.length} из ${listing.maxProjects || 2}.`);
      } else {
        const created = await fetch('/api/projects', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: serializeEditorSnapshot(project),
        }).then((response) => response.json());
        if (cancelled) return;
        if (created.error) setError(created.error);
        else {
          skipNextSave.current = true;
          setProjectId(created.id);
          setProjectList([created]);
          setNotice('Создан слот 1 из 2. Каждый проект — до 60 минут. Дубли и медиа хранятся в этом слоте.');
        }
      }
      setWorkspaceReady(true);
    })().catch(() => {
      if (!cancelled) {
        setError('Не удалось открыть кабинет проектов.');
        setWorkspaceReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [cloudSettings]);

  useEffect(() => {
    if (!cloudSettings || !workspaceReady || !projectId) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      void fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: serializeEditorSnapshot(project),
      }).then(async (response) => {
        const payload = await response.json() as ProjectMeta & {error?: string};
        if (!response.ok) setError(payload.error || 'Не удалось сохранить проект.');
        else {
          setProjectList((current) => current.map((item) => item.id === projectId ? {...item, ...payload} : item));
        }
      });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [project, projectId, cloudSettings, workspaceReady]);

  const settingsReady = Boolean(settings.apiKey && settings.userVoiceId && settings.assistantVoiceId);

  useEffect(() => {
    setProject((current) => ({
      ...current,
      ttsProvider: 'elevenlabs',
      elevenLabs: {
        modelId: current.elevenLabs?.modelId ?? 'eleven_multilingual_v2',
        ...current.elevenLabs,
        userVoiceId: settings.userVoiceId || current.elevenLabs?.userVoiceId,
        assistantVoiceId: settings.assistantVoiceId || current.elevenLabs?.assistantVoiceId,
      },
    }));
  }, [settings.userVoiceId, settings.assistantVoiceId]);

  const updateSettings = (patch: Partial<AppSettings>) => {
    setSettings((current) => ({...current, ...patch}));
    setError('');
    setNotice(cloudSettings
      ? 'Настройки ElevenLabs сохранены для вашей учётки Lokvita. Ключ не попадает в JSON-снимок.'
      : 'Настройки ElevenLabs сохранены в этом браузере. Ключ не попадает в JSON-снимок.');
  };

  const changeTimelineZoom = (direction: -1 | 1) => {
    setTimelineFit(false);
    setTimelineZoom((current) => {
      const base = timelineFit ? 1 : current;
      return Math.min(4, Math.max(0.5, base + direction * 0.25));
    });
  };

  const importFile = async (file: File) => {
    try {
      const source = await file.text();
      const isJson = file.name.toLowerCase().endsWith('.json') || file.type === 'application/json';
      const imported = isJson
        ? parseEditorSnapshot(source).project
        : importedChatToProject(parseMarkdownChat(source));
      setProject(imported);
      setSelectedMessageId(imported.messages[0]?.id ?? '');
      setError('');
      setNotice(isJson
        ? `Снимок восстановлен: ${imported.messages.length} реплик.`
        : `Импортировано: ${imported.messages.length} реплик. Озвучка ещё не создана.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось импортировать файл.');
    }
  };

  const exportSnapshot = () => {
    const blob = new Blob([serializeEditorSnapshot(project)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${safeFileName(project.title)}.chat-video.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setError('');
    setNotice('JSON-снимок сохранён. Аудиофайлы в него не встраиваются.');
  };

  const renderVideo = async () => {
    setError('');
    setNotice(`Запускается рендер ${dimensions.width}×${dimensions.height}, ${project.fps} FPS…`);
    setRenderJob({id: '', status: 'rendering'});
    try {
      const response = await fetch('/api/render', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({project, projectId}),
      });
      const initial = await response.json() as RenderJob & {error?: string};
      if (!response.ok || !initial.id) throw new Error(initial.error || 'Не удалось запустить Remotion.');
      setRenderJob(initial);
      setNotice('Видео рендерится локально. Для длинного диалога это может занять несколько минут.');

      let current = initial;
      while (current.status === 'rendering') {
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
        const statusResponse = await fetch(`/api/render/${initial.id}`);
        current = await statusResponse.json() as RenderJob;
        if (!statusResponse.ok) throw new Error(current.error || 'Не удалось получить состояние рендера.');
        setRenderJob(current);
      }
      if (current.status === 'failed') throw new Error(current.error || 'Рендер завершился с ошибкой.');
      setNotice('MP4 готов. Файл можно скачать кнопкой вверху.');
    } catch (caught) {
      setRenderJob((current) => current ? {...current, status: 'failed'} : null);
      setError(caught instanceof Error ? caught.message : 'Ошибка рендера видео.');
    }
  };

  const updateMessage = (messageId: string, text: string) => {
    setProject((current) => ({
      ...current,
      messages: current.messages.map((message) => {
        if (message.id !== messageId) return message;
        const durationMs = estimateSpeechDuration(text);
        const history = message.takes ?? (message.take.audioPath ? [message.take] : []);
        return {
          ...message,
          text,
          takes: history,
          take: {
            ...message.take,
            id: `${message.take.id}-edited`,
            audioPath: undefined,
            durationMs,
            words: createApproximateWordTimings(text, durationMs),
          },
        };
      }),
    }));
    setNotice('Текст изменён. Существующая озвучка снята с реплики как устаревшая.');
  };

  const updateAuthor = (role: PrototypeMessage['role'], author: string) => {
    setProject((current) => ({
      ...current,
      messages: current.messages.map((message) => message.role === role ? {...message, author} : message),
    }));
    setError('');
    setNotice(`Подпись роли «${role === 'user' ? 'Пользователь' : 'Ассистент'}» обновлена во всех репликах.`);
  };

  const updateTheme = (patch: Partial<ProjectTheme>) => {
    setProject((current) => ({
      ...current,
      theme: {...defaultProjectTheme, ...current.theme, ...patch},
    }));
    setError('');
    setNotice('Стиль обновлён и добавлен в автосохранение.');
  };

  const selectThemePreset = (presetId: ThemePresetId) => {
    const preset = themePresets[presetId];
    updateTheme({
      presetId,
      canvas: preset.canvas,
      chatBackground: preset.chat,
      accent: preset.accent,
      userBubble: preset.userBubble,
      assistantBubble: preset.assistantBubble,
    });
  };

  const updateVideo = (patch: Partial<VideoSettings>) => {
    setProject((current) => ({
      ...current,
      video: {...defaultVideoSettings, ...current.video, ...patch},
    }));
    setError('');
    setNotice('Параметры кадра обновлены и добавлены в автосохранение.');
  };

  const updateElevenLabs = (patch: Partial<ElevenLabsSettings>) => {
    setProject((current) => ({
      ...current,
      elevenLabs: {
        modelId: current.elevenLabs?.modelId ?? 'eleven_multilingual_v2',
        ...current.elevenLabs,
        ...patch,
      },
    }));
    setError('');
    setNotice('Настройки ElevenLabs обновлены и добавлены в автосохранение.');
  };

  const generateTake = async (message: PrototypeMessage) => {
    const estimatedCredits = message.text.length;
    const userVoiceId = project.elevenLabs?.userVoiceId?.trim() || settings.userVoiceId;
    const assistantVoiceId = project.elevenLabs?.assistantVoiceId?.trim() || settings.assistantVoiceId;
    const voiceId = message.role === 'assistant' ? assistantVoiceId : userVoiceId;
    if (cloudSettings && !projectId) {
      setError('Сначала сохраните проект (доступно 2 слота, каждый до 60 минут).');
      return;
    }
    if (!settings.apiKey) {
      setMobilePanel('settings');
      setError('Укажите API-ключ ElevenLabs в настройках.');
      return;
    }
    if (!voiceId) {
      setMobilePanel('settings');
      setError(`Укажите Voice ID для роли «${message.role === 'assistant' ? 'ассистент' : 'пользователь'}» в настройках.`);
      return;
    }
    if (!window.confirm(`Отправить реплику в ElevenLabs?\n\n${estimatedCredits} символов ≈ ${estimatedCredits} кредитов.`)) return;

    setGenerating((current) => ({...current, [message.id]: true}));
    setError('');
    setNotice(`Генерируется реплика «${message.author}»…`);
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          messageId: message.id,
          role: message.role,
          text: message.text,
          apiKey: settings.apiKey,
          projectId,
          modelId: project.elevenLabs?.modelId,
          userVoiceId,
          assistantVoiceId,
        }),
      });
      const payload = await response.json() as {take?: AudioTake; error?: string};
      if (!response.ok || !payload.take) throw new Error(payload.error || 'ElevenLabs не вернул аудиодубль.');
      const newTake = payload.take;
      setProject((current) => ({
        ...current,
        messages: current.messages.map((item) => {
          if (item.id !== message.id) return item;
          const history = item.takes ?? (item.take.audioPath ? [item.take] : []);
          return {...item, take: newTake, takes: [...history, newTake]};
        }),
      }));
      setNotice(`Новый дубль готов: ${(newTake.durationMs / 1000).toFixed(1)} сек.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Ошибка генерации аудио.');
    } finally {
      setGenerating((current) => ({...current, [message.id]: false}));
    }
  };

  const activateTake = (messageId: string, takeId: string) => {
    setProject((current) => ({
      ...current,
      messages: current.messages.map((message) => {
        if (message.id !== messageId) return message;
        const selected = message.takes?.find((take) => take.id === takeId);
        return selected ? {...message, take: selected} : message;
      }),
    }));
    setNotice('Активный дубль изменён, таймлайн пересчитан.');
  };

  const uploadImage = async (messageId: string, file: File) => {
    setUploadingImage((current) => ({...current, [messageId]: true}));
    setError('');
    setNotice(`Загружается изображение «${file.name}»…`);
    try {
      if (file.size > 10_000_000) throw new Error('Файл изображения превышает 10 МБ.');
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Поддерживаются только PNG, JPEG и WebP.');
      const {width, height} = await getImageDimensions(file);
      const response = await fetch('/api/image', {
        method: 'POST',
        headers: {
          'Content-Type': file.type,
          'X-Message-Id': messageId,
          'X-Project-Id': projectId,
          'X-File-Name': encodeURIComponent(file.name),
          'X-Image-Width': String(width),
          'X-Image-Height': String(height),
        },
        body: file,
      });
      const payload = await response.json() as {image?: MessageImage; error?: string};
      if (!response.ok || !payload.image) throw new Error(payload.error || 'Сервер не сохранил изображение.');
      setProject((current) => ({
        ...current,
        messages: current.messages.map((message) => message.id === messageId
          ? {...message, attachments: [...(message.attachments ?? []), payload.image!]}
          : message),
      }));
      setNotice(`Изображение «${file.name}» добавлено в реплику.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Ошибка загрузки изображения.');
    } finally {
      setUploadingImage((current) => ({...current, [messageId]: false}));
    }
  };

  const updateMessageImage = (messageId: string, imageId: string, patch: Partial<MessageImage>) => {
    setProject((current) => ({
      ...current,
      messages: current.messages.map((message) => message.id === messageId
        ? {...message, attachments: message.attachments?.map((image) => image.id === imageId ? {...image, ...patch} : image)}
        : message),
    }));
    setNotice('Настройки изображения обновлены.');
  };

  const removeMessageImage = (messageId: string, imageId: string) => {
    setProject((current) => ({
      ...current,
      messages: current.messages.map((message) => message.id === messageId
        ? {...message, attachments: message.attachments?.filter((image) => image.id !== imageId)}
        : message),
    }));
    setNotice('Изображение удалено из реплики. Файл оставлен в локальной папке проекта.');
  };

  const moveSelectedMessage = (offset: -1 | 1) => {
    if (!selectedMessage) return;
    setProject((current) => ({...current, messages: moveMessageBy(current.messages, selectedMessage.id, offset)}));
    setNotice(offset < 0 ? 'Реплика перемещена раньше.' : 'Реплика перемещена позже.');
  };

  const moveMessageTo = (sourceId: string, targetId: string) => {
    setProject((current) => ({...current, messages: reorderMessages(current.messages, sourceId, targetId)}));
    setDraggedMessageId('');
    setDropTargetId('');
    setNotice('Порядок реплик изменён, таймлайн пересчитан.');
  };

  const deleteSelectedMessage = () => {
    if (!selectedMessage || project.messages.length <= 1) return;
    if (!window.confirm(`Удалить реплику «${selectedMessage.author}» из проекта?\n\nАудио и изображения останутся в локальной папке.`)) return;
    const index = project.messages.findIndex((message) => message.id === selectedMessage.id);
    const nextSelected = project.messages[index + 1] ?? project.messages[index - 1];
    setProject((current) => ({...current, messages: current.messages.filter((message) => message.id !== selectedMessage.id)}));
    setSelectedMessageId(nextSelected?.id ?? '');
    setNotice('Реплика удалена из проекта. Локальные медиафайлы сохранены.');
  };

  const restoreDemo = () => {
    setProject(prototypeProject);
    setSelectedMessageId(prototypeProject.messages[0]?.id ?? '');
    setError('');
    setNotice('Демонстрационный проект восстановлен.');
  };

  const openProject = async (id: string) => {
    const packed = await fetch(`/api/projects/${id}`).then((response) => response.json());
    if (packed.error || !packed.snapshot?.project) {
      setError(packed.error || 'Не удалось открыть проект.');
      return;
    }
    skipNextSave.current = true;
    setProjectId(id);
    setProject(packed.snapshot.project);
    setSelectedMessageId(packed.snapshot.project.messages[0]?.id ?? '');
    setNotice(`Открыт проект «${packed.snapshot.project.title}».`);
  };

  const createProject = async () => {
    if (projectList.length >= maxProjects) {
      setError(`Можно хранить не больше ${maxProjects} проектов. Удалите один.`);
      return;
    }
    const blank = importedChatToProject(parseMarkdownChat('# Новый проект\n\n## Пользователь\n\nТекст реплики.\n'));
    const created = await fetch('/api/projects', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: serializeEditorSnapshot(blank),
    }).then((response) => response.json());
    if (created.error) {
      setError(created.error);
      return;
    }
    skipNextSave.current = true;
    setProjectId(created.id);
    setProject(blank);
    setSelectedMessageId(blank.messages[0]?.id ?? '');
    setProjectList((current) => [...current, created]);
    setNotice(`Создан слот ${projectList.length + 1} из ${maxProjects}.`);
  };

  const deleteProject = async () => {
    if (!projectId) return;
    if (!window.confirm('Удалить этот проект вместе с дублями, картинками и MP4? Восстановить нельзя.')) return;
    const payload = await fetch(`/api/projects/${projectId}`, {method: 'DELETE'}).then((response) => response.json());
    if (payload.error) {
      setError(payload.error);
      return;
    }
    const remaining = projectList.filter((item) => item.id !== projectId);
    setProjectList(remaining);
    if (remaining[0]) await openProject(remaining[0].id);
    else {
      setProjectId('');
      await createProject();
    }
    setNotice('Проект и его медиа удалены с сервера.');
  };

  const takeHistory = selectedMessage
    ? (selectedMessage.takes?.length ? selectedMessage.takes : [selectedMessage.take])
    : [];

  const renderTakePanel = () => selectedMessage ? (
    <div className="take-panel">
      <h3>Дубли</h3>
      <div className="take-controls">
        <button
          type="button"
          className={generating[selectedMessage.id] ? 'generating-button' : ''}
          disabled={generating[selectedMessage.id] || !selectedMessage.text.trim()}
          onClick={() => void generateTake(selectedMessage)}
        >
          {generating[selectedMessage.id]
            ? 'Генерация…'
            : selectedMessage.take.audioPath ? 'Новый дубль' : 'Озвучить'}
        </button>
        <small>
          {generating[selectedMessage.id]
            ? 'Идёт запрос в ElevenLabs'
            : takeHistory.filter((take) => take.audioPath).length
              ? `${takeHistory.filter((take) => take.audioPath).length} дубл.`
              : 'Ещё нет аудио'}
        </small>
      </div>
      <div className="take-comparison">
        {takeHistory.map((take, index) => (
          <div className={take.id === selectedMessage.take.id ? 'take-row active' : 'take-row'} key={take.id}>
            <div>
              <b>Дубль {index + 1}{take.id === selectedMessage.take.id ? ' · активен' : ''}</b>
              <small>{(take.durationMs / 1000).toFixed(1)} сек. · {take.alignment ?? 'approximate'}</small>
            </div>
            {take.audioPath ? <audio controls preload="metadata" src={take.audioPath} /> : <span className="no-audio">Без аудио</span>}
            <button
              className="secondary"
              type="button"
              disabled={take.id === selectedMessage.take.id || !take.audioPath}
              title={take.sourceText && take.sourceText !== selectedMessage.text
                ? 'Дубль создан для предыдущей версии текста; тайминги могут не совпадать'
                : undefined}
              onClick={() => activateTake(selectedMessage.id, take.id)}
            >
              {take.id === selectedMessage.take.id
                ? 'Активен'
                : take.sourceText && take.sourceText !== selectedMessage.text
                  ? 'Активировать старый'
                  : 'Активировать'}
            </button>
          </div>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <main className={`app-shell panel-${mobilePanel}`}>
      <header>
        <div className="brand">
          <a className="brand-link" href="https://lokvita.org" target="_blank" rel="noopener noreferrer">
            <img src="/brand/wordmark-40.png" alt="Lokvita" height={40} />
          </a>
          <div>
            <span className="eyebrow">VChat · {settingsReady ? 'ElevenLabs готов' : 'Нужны настройки голоса'}</span>
            <h1>{project.title}</h1>
          </div>
        </div>
        <div className="header-actions">
          <span className="session-user" title={username}>{username}</span>
          {cloudSettings ? (
            <div className="workspace-bar">
              <select
                aria-label="Проект"
                value={projectId}
                disabled={!workspaceReady || projectList.length === 0}
                onChange={(event) => void openProject(event.target.value)}
              >
                {projectList.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title} · {Math.max(1, Math.round((item.durationMs || 0) / 1000))} с
                  </option>
                ))}
              </select>
              <button className="secondary" type="button" disabled={!workspaceReady || projectList.length >= maxProjects} onClick={() => void createProject()}>Новый</button>
              <button className="secondary" type="button" disabled={!workspaceReady || !projectId} onClick={() => void deleteProject()}>Удалить</button>
              <small>{projectList.length}/{maxProjects} · до 60 мин · сейчас {(timeline.durationMs / 60000).toFixed(1)} мин</small>
            </div>
          ) : null}
          <button className="secondary desktop-only" type="button" onClick={restoreDemo}>Вернуть демо</button>
          <button className="secondary" type="button" onClick={exportSnapshot}>Сохранить .json</button>
          <button type="button" onClick={() => fileInput.current?.click()}>Импортировать</button>
          <button type="button" disabled={renderJob?.status === 'rendering'} onClick={() => void renderVideo()}>
            {renderJob?.status === 'rendering' ? 'Рендер…' : 'Экспорт MP4'}
          </button>
          {renderJob?.status === 'complete' && renderJob.url ? (
            <a className="download-button" href={renderJob.url} download>Скачать MP4</a>
          ) : null}
          <button className="secondary mobile-only" type="button" onClick={restoreDemo}>Демо</button>
          <button className="secondary" type="button" onClick={onLogout}>Выйти</button>
          <input
            ref={fileInput}
            hidden
            type="file"
            accept=".md,.json,text/markdown,text/plain,application/json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importFile(file);
              event.target.value = '';
            }}
          />
        </div>
      </header>
      <div className={`notice ${error ? 'error' : ''}`}>{error || notice}</div>
      <section className="workspace">
        <aside>
          <details className="theme-editor collapsible-editor settings-editor" open={!settingsReady}>
            <summary className="aside-title">
              <h2>Настройки</h2>
              <small>{settingsReady ? 'Ключ в этом браузере' : 'Ключ и голоса'}</small>
            </summary>
            <div className="editor-body">
              <label>
                API-ключ ElevenLabs
                <span className="secret-field">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={settings.apiKey}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="xi-…"
                    onChange={(event) => updateSettings({apiKey: event.target.value})}
                  />
                  <button className="secondary" type="button" onClick={() => setShowApiKey((current) => !current)}>
                    {showApiKey ? 'Скрыть' : 'Показать'}
                  </button>
                </span>
              </label>
              <label>
                Voice ID пользователя
                <input
                  value={settings.userVoiceId}
                  spellCheck={false}
                  placeholder="21m00Tcm4TlvDq8ikWAM"
                  onChange={(event) => updateSettings({userVoiceId: event.target.value.trim()})}
                />
              </label>
              <label>
                Voice ID ассистента
                <input
                  value={settings.assistantVoiceId}
                  spellCheck={false}
                  placeholder="второй голос ElevenLabs"
                  onChange={(event) => updateSettings({assistantVoiceId: event.target.value.trim()})}
                />
              </label>
              <p className="provider-note">
                {cloudSettings
                  ? 'Ключ привязан к вашей учётке Lokvita и доступен с любого устройства. В JSON-снимок проекта он не записывается.'
                  : 'Ключ хранится только в этом браузере и уходит на сервер в момент озвучки. В JSON-снимок проекта он не записывается.'}
              </p>
            </div>
          </details>
          <details className="theme-editor collapsible-editor">
            <summary className="aside-title">
              <h2>Оформление</h2>
              <small>Сохраняется в проекте</small>
            </summary>
            <div className="editor-body">
            <label>
              Стиль чата
              <select
                value={project.theme?.presetId ?? defaultProjectTheme.presetId}
                onChange={(event) => selectThemePreset(event.target.value as ThemePresetId)}
              >
                <option value="neutral">Нейтральный</option>
                <option value="chatgpt">В духе ChatGPT</option>
                <option value="gemini">В духе Gemini</option>
              </select>
            </label>
            <div className="theme-text-fields">
              <label>
                Заголовок
                <input
                  value={project.theme?.chatTitle ?? defaultProjectTheme.chatTitle}
                  onChange={(event) => updateTheme({chatTitle: event.target.value})}
                />
              </label>
              <label>
                Подпись
                <input
                  value={project.theme?.chatSubtitle ?? defaultProjectTheme.chatSubtitle}
                  onChange={(event) => updateTheme({chatSubtitle: event.target.value})}
                />
              </label>
            </div>
            <div className="color-fields">
              {([
                ['canvas', 'Основной фон'],
                ['chatBackground', 'Подложка чата'],
                ['accent', 'Акцент'],
                ['userBubble', 'Пользователь'],
                ['assistantBubble', 'Ассистент'],
              ] as const).map(([key, label]) => (
                <label key={key}>
                  <input
                    type="color"
                    value={project.theme?.[key] ?? (
                      key === 'chatBackground'
                        ? themePresets[project.theme?.presetId ?? 'neutral'].chat
                        : themePresets[project.theme?.presetId ?? 'neutral'][key]
                    )}
                    onChange={(event) => updateTheme({[key]: event.target.value})}
                  />
                  {label}
                </label>
              ))}
            </div>
            </div>
          </details>
          <details className="theme-editor video-editor collapsible-editor">
            <summary className="aside-title">
              <h2>Видеокадр</h2>
              <small>{dimensions.width}×{dimensions.height}</small>
            </summary>
            <div className="editor-body">
            <label>
              Формат
              <select
                value={video.format}
                onChange={(event) => updateVideo({format: event.target.value as VideoSettings['format']})}
              >
                {Object.entries(videoDimensions).map(([id, option]) => (
                  <option key={id} value={id}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="range-field">
              <span>Масштаб интерфейса <b>{Math.round(video.uiScale * 100)}%</b></span>
              <input
                type="range"
                min="0.7"
                max="1.4"
                step="0.05"
                value={video.uiScale}
                onChange={(event) => updateVideo({uiScale: Number(event.target.value)})}
              />
            </label>
            <label className="range-field">
              <span>Скорость индикатора набора <b>{video.typingSpeed.toFixed(1)}×</b></span>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={video.typingSpeed}
                onChange={(event) => updateVideo({typingSpeed: Number(event.target.value)})}
              />
            </label>
            <label>
              Частота кадров
              <select
                value={project.fps}
                onChange={(event) => setProject((current) => ({...current, fps: Number(event.target.value)}))}
              >
                {[24, 25, 30, 50, 60].map((fps) => <option key={fps} value={fps}>{fps} FPS</option>)}
              </select>
            </label>
            </div>
          </details>
          <details className="theme-editor video-editor collapsible-editor">
            <summary className="aside-title">
              <h2>Озвучка</h2>
              <small>ElevenLabs</small>
            </summary>
            <div className="editor-body">
              <div className="elevenlabs-settings">
                <label>
                  Модель
                  <select
                    value={elevenLabs.modelId}
                    onChange={(event) => updateElevenLabs({modelId: event.target.value as ElevenLabsModelId})}
                  >
                    <option value="eleven_multilingual_v2">Multilingual v2 · качество</option>
                    <option value="eleven_flash_v2_5">Flash v2.5 · быстро и дешевле</option>
                    <option value="eleven_turbo_v2_5">Turbo v2.5 · устаревающая</option>
                  </select>
                </label>
              </div>
              <p className="provider-note">
                Голоса и API-ключ задаются в блоке «Настройки». Новые дубли всегда идут через ElevenLabs.
              </p>
            </div>
          </details>
          <section className="scenario-editor" data-panel="script">
            <div className="aside-title">
              <h2>Сценарий</h2>
              <small>{(timeline.durationMs / 1000).toFixed(1)} сек. · {timeline.messages.length}</small>
            </div>
            {selectedMessage ? (
              <div className="scenario-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={selectedMessageIndex <= 0}
                  onClick={() => moveSelectedMessage(-1)}
                >← Раньше</button>
                <button
                  type="button"
                  className="secondary"
                  disabled={selectedMessageIndex >= timeline.messages.length - 1}
                  onClick={() => moveSelectedMessage(1)}
                >Позже →</button>
                <button
                  type="button"
                  className="secondary delete-message"
                  disabled={timeline.messages.length <= 1}
                  title={timeline.messages.length <= 1 ? 'Нельзя удалить единственную реплику' : 'Удалить реплику из проекта'}
                  onClick={deleteSelectedMessage}
                >Удалить</button>
              </div>
            ) : null}
            {selectedMessage ? (
              <article
                key={selectedMessage.id}
                className="selected-message"
              >
              <div className="message-heading">
                <span>{String(selectedMessageIndex + 1).padStart(2, '0')} · {selectedMessage.author}</span>
                <b className={generating[selectedMessage.id] ? 'audio-generating' : selectedMessage.take.audioPath ? 'audio-ready' : ''}>
                  {generating[selectedMessage.id] ? 'Озвучивается' : selectedMessage.take.audioPath ? 'Аудио готово' : 'Без аудио'}
                </b>
              </div>
              <label className="author-field">
                Подпись автора
                <input
                  value={selectedMessage.author}
                  maxLength={100}
                  placeholder={selectedMessage.role === 'user' ? 'Пользователь' : 'ChatGPT'}
                  onChange={(event) => updateAuthor(selectedMessage.role, event.target.value)}
                />
                <small>Применяется ко всем репликам этой роли</small>
              </label>
              <textarea
                aria-label={`Текст реплики ${selectedMessageIndex + 1}`}
                value={selectedMessage.text}
                onChange={(event) => updateMessage(selectedMessage.id, event.target.value)}
              />
              <small>{(selectedMessage.take.durationMs / 1000).toFixed(1)} сек. · {selectedMessage.take.words.length} слов</small>
              {selectedMessage.take.audioPath ? (
                <small className="alignment-label">
                  {selectedMessage.take.alignment === 'whisper'
                    ? 'Точные тайминги · Whisper'
                    : selectedMessage.take.alignment === 'provider'
                      ? 'Точные тайминги · провайдер'
                      : 'Приблизительные тайминги'}
                </small>
              ) : null}
              {renderTakePanel()}
              <section className="message-images">
                <div className="message-images-heading">
                  <b>Изображения</b>
                  <button
                    type="button"
                    className={uploadingImage[selectedMessage.id] ? 'secondary generating-button' : 'secondary'}
                    disabled={uploadingImage[selectedMessage.id]}
                    onClick={() => imageInput.current?.click()}
                  >{uploadingImage[selectedMessage.id] ? 'Загрузка…' : 'Добавить'}</button>
                  <input
                    ref={imageInput}
                    hidden
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadImage(selectedMessage.id, file);
                      event.target.value = '';
                    }}
                  />
                </div>
                {(selectedMessage.attachments ?? []).map((image) => (
                  <div className="message-image-card" key={image.id}>
                    <img src={image.path} alt={image.fileName} />
                    <div className="message-image-fields">
                      <small title={image.fileName}>{image.fileName}</small>
                      <select
                        aria-label={`Расположение изображения ${image.fileName}`}
                        value={image.position}
                        onChange={(event) => updateMessageImage(selectedMessage.id, image.id, {position: event.target.value as MessageImage['position']})}
                      >
                        <option value="before-text">Над текстом</option>
                        <option value="after-text">Под текстом</option>
                      </select>
                      <select
                        aria-label={`Масштабирование изображения ${image.fileName}`}
                        value={image.fit}
                        onChange={(event) => updateMessageImage(selectedMessage.id, image.id, {fit: event.target.value as MessageImage['fit']})}
                      >
                        <option value="contain">Вписать полностью</option>
                        <option value="cover">Заполнить с обрезкой</option>
                      </select>
                      <select
                        aria-label={`Появление изображения ${image.fileName}`}
                        value={image.reveal}
                        onChange={(event) => updateMessageImage(selectedMessage.id, image.id, {reveal: event.target.value as MessageImage['reveal']})}
                      >
                        <option value="bubble">Вместе с пузырём</option>
                        <option value="speech">В начале озвучки</option>
                        <option value="after-text">После текста</option>
                      </select>
                    </div>
                    <button className="secondary image-remove" type="button" onClick={() => removeMessageImage(selectedMessage.id, image.id)}>Убрать</button>
                  </div>
                ))}
                {(selectedMessage.attachments?.length ?? 0) === 0 ? <small className="no-images">Изображений нет</small> : null}
              </section>
              </article>
            ) : <p className="empty-message">Выберите реплику на таймлайне.</p>}
          </section>
        </aside>
        <div className="stage">
          <div
            className="preview"
            data-panel="preview"
            style={{
              width: video.format === 'landscape' ? 'min(100%, 900px)' : video.format === 'square' ? 'min(100%, 720px)' : 'min(100%, 480px)',
              aspectRatio: `${dimensions.width} / ${dimensions.height}`,
            }}
          >
            <Player
              ref={player}
              component={ChatVideo}
              inputProps={{project}}
              durationInFrames={timeline.durationInFrames}
              compositionWidth={dimensions.width}
              compositionHeight={dimensions.height}
              fps={project.fps}
              controls
              loop
              style={{width: '100%', height: '100%'}}
            />
          </div>
          <section className="timeline-editor" data-panel="timeline">
            <div className="timeline-header">
              <div>
                <span className="eyebrow">Таймлайн</span>
                <h2>{selectedMessage ? `${selectedMessage.author} · ${(selectedMessage.take.durationMs / 1000).toFixed(1)} сек.` : 'Нет реплик'}</h2>
              </div>
              {selectedMessage ? (
                <button type="button" onClick={() => {
                  player.current?.seekTo(Math.round(selectedMessage.speechStartMs * project.fps / 1000));
                  player.current?.play();
                }}>Показать в видео</button>
              ) : null}
            </div>
            <div className="timeline-tools" aria-label="Масштаб таймлайна">
              <button type="button" className="secondary" aria-label="Уменьшить масштаб таймлайна" disabled={!timelineFit && timelineZoom <= 0.5} onClick={() => changeTimelineZoom(-1)}>−</button>
              <span>{timelineFit ? 'Весь таймлайн' : `${Math.round(timelineZoom * 100)}%`}</span>
              <button type="button" className="secondary" aria-label="Увеличить масштаб таймлайна" disabled={!timelineFit && timelineZoom >= 4} onClick={() => changeTimelineZoom(1)}>+</button>
              <button type="button" className="secondary fit-button" disabled={timelineFit} onClick={() => setTimelineFit(true)}>Вместить всё</button>
            </div>
            <div className="timeline-scroll">
              <div
                className={`timeline-track ${timelineFit ? 'fit' : ''}`}
                aria-label="Границы клипов"
                style={timelineFit ? undefined : {width: `${Math.max(100, timeline.durationMs / 1000 * 36 * timelineZoom)}px`}}
              >
                {timeline.messages.map((message, index) => (
                  <button
                    key={message.id}
                    data-message-id={message.id}
                    type="button"
                    draggable
                    className={[
                      generating[message.id] ? 'audio-generating' : message.take.audioPath ? 'audio-ready' : 'audio-missing',
                      message.id === selectedMessage?.id ? 'active' : '',
                      message.id === draggedMessageId ? 'dragging' : '',
                      message.id === dropTargetId && message.id !== draggedMessageId ? 'drop-target' : '',
                    ].filter(Boolean).join(' ')}
                    style={{flexGrow: Math.max(message.endMs - message.startMs, 1)}}
                    title={`${message.author}: ${(message.startMs / 1000).toFixed(1)}–${(message.endMs / 1000).toFixed(1)} сек. · ${generating[message.id] ? 'идёт озвучка' : message.take.audioPath ? 'аудио готово' : 'без аудио'} · перетащите для изменения порядка`}
                    aria-label={`Реплика ${index + 1}, ${generating[message.id] ? 'идёт озвучка' : message.take.audioPath ? 'аудио готово' : 'без аудио'}`}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', message.id);
                      setDraggedMessageId(message.id);
                      setSelectedMessageId(message.id);
                    }}
                    onDragEnter={() => setDropTargetId(message.id)}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const sourceId = event.dataTransfer.getData('text/plain') || draggedMessageId;
                      if (sourceId && sourceId !== message.id) moveMessageTo(sourceId, message.id);
                    }}
                    onDragEnd={() => {
                      setDraggedMessageId('');
                      setDropTargetId('');
                    }}
                    onClick={() => {
                      setSelectedMessageId(message.id);
                      player.current?.seekTo(Math.round(message.startMs * project.fps / 1000));
                    }}
                  >{index + 1}</button>
                ))}
              </div>
            </div>
            {selectedMessage ? (
              <>
                <div className="clip-ruler">
                  <span>{(selectedMessage.startMs / 1000).toFixed(2)} с</span>
                  <div className="waveform" aria-label="Форма волны активного дубля">
                    {Array.from({length: 48}, (_, index) => {
                      const word = selectedMessage.take.words[index % Math.max(selectedMessage.take.words.length, 1)];
                      const seed = word ? word.text.length + index * 7 : index * 7;
                      return <i key={index} style={{height: `${22 + (seed * 13) % 72}%`}} />;
                    })}
                  </div>
                  <span>{(selectedMessage.endMs / 1000).toFixed(2)} с</span>
                </div>
                {renderTakePanel()}
              </>
            ) : null}
          </section>
        </div>
      </section>
      <nav className="mobile-nav" aria-label="Разделы редактора">
        {([
          ['script', 'Сценарий'],
          ['preview', 'Превью'],
          ['timeline', 'Таймлайн'],
          ['settings', 'Настройки'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={mobilePanel === id ? 'active' : ''}
            onClick={() => setMobilePanel(id)}
          >{label}</button>
        ))}
      </nav>
    </main>
  );
};

const Root: React.FC = () => {
  const [session, setSession] = useState<Session | 'loading' | null>('loading');

  useEffect(() => {
    fetch('/api/session')
      .then(async (response) => {
        if (!response.ok) {
          setSession(null);
          return;
        }
        const payload = await response.json() as Session;
        setSession({
          username: payload.username,
          membershipStatus: payload.membershipStatus,
          userId: payload.userId,
          auth: payload.auth,
        });
      })
      .catch(() => setSession(null));
  }, []);

  if (session === 'loading') {
    return (
      <section className="login-screen">
        <div className="login-card"><p>Загрузка…</p></div>
      </section>
    );
  }
  if (!session) return <LoginScreen onSuccess={setSession} />;

  return (
    <App
      username={session.username}
      cloudSettings={session.auth !== false}
      onLogout={() => {
        void fetch('/api/logout', {method: 'POST'}).finally(() => setSession(null));
      }}
    />
  );
};

createRoot(document.getElementById('root')!).render(<Root />);
