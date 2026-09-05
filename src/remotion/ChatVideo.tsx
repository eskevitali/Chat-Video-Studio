import React from 'react';
import {
  AbsoluteFill,
  Audio,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {compileTimeline, frameToMilliseconds, visibleTextAt} from '../domain/timeline';
import {stripSpeechMarkup} from '../domain/speech-tags';
import type {CompiledMessage, PrototypeProject} from '../domain/types';
import {prototypeProject} from '../data/prototype-project';
import {defaultProjectTheme, resolveTheme} from './theme';
import {getVideoDimensions, resolveVideoSettings} from '../domain/video';

const estimatedBubbleHeight = (textLength: number, isUser: boolean, scale: number, widthFactor: number, imageCount = 0) =>
  Math.max(145 * scale, (76 + Math.max(1, textLength / ((isUser ? 34 : 42) * widthFactor)) * 48 + imageCount * 350) * scale);

const progressiveTextLength = (message: CompiledMessage, timeMs: number) => {
  const spokenLength = stripSpeechMarkup(message.text).length || message.text.length;
  if (timeMs <= message.speechStartMs) return 0;
  if (timeMs >= message.speechEndMs || message.take.words.length === 0) {
    return message.take.words.length === 0
      ? spokenLength * interpolate(timeMs, [message.speechStartMs, message.speechEndMs], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})
      : spokenLength;
  }
  const localTime = timeMs - message.speechStartMs;
  let length = 0;
  for (const word of message.take.words) {
    if (localTime >= word.endMs) {
      length += word.text.length + 1;
      continue;
    }
    if (localTime > word.startMs) {
      length += word.text.length * interpolate(localTime, [word.startMs, Math.max(word.startMs + 1, word.endMs)], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
    }
    break;
  }
  return Math.min(spokenLength, length);
};

const TypingDots: React.FC<{color: string; scale: number}> = ({color, scale}) => {
  const frame = useCurrentFrame();
  return (
    <div style={{display: 'flex', gap: 8, padding: '9px 3px'}}>
      {[0, 1, 2].map((index) => (
        <span key={index} style={{
          width: 11 * scale,
          height: 11 * scale,
          borderRadius: 999,
          background: color,
          opacity: 0.25 + 0.75 * Math.max(0, Math.sin((frame - index * 4) / 5)),
        }} />
      ))}
    </div>
  );
};

export type ChatVideoProps = {project?: PrototypeProject};

export const ChatVideo: React.FC<ChatVideoProps> = ({project = prototypeProject}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const timeMs = frameToMilliseconds(frame, fps);
  const timeline = compileTimeline(project);
  const theme = resolveTheme(project.theme);
  const themeSettings = project.theme ?? defaultProjectTheme;
  const video = resolveVideoSettings(project.video);
  const outerX = Math.round(width * 0.06);
  const outerTop = Math.round(height * 0.07);
  const outerBottom = Math.round(height * 0.095);
  const browserWidth = width - outerX * 2;
  const browserHeight = height - outerTop - outerBottom;
  const layoutScale = Math.min(browserWidth / 948, browserHeight / 1550);
  const uiScale = layoutScale * video.uiScale;
  const titleHeight = 118 * layoutScale;
  const chatHeight = browserHeight - titleHeight;
  const widthFactor = Math.max(1, browserWidth / (948 * layoutScale));

  const activeIndex = timeline.messages.findIndex((message) => timeMs < message.endMs);
  const effectiveIndex = activeIndex === -1 ? timeline.messages.length - 1 : activeIndex;
  const contentBottom = timeline.messages.slice(0, effectiveIndex + 1).reduce((sum, message) => {
    if (timeMs < message.typingStartMs) return sum;
    const visibleTextLength = timeMs < message.bubbleStartMs ? 0 : progressiveTextLength(message, timeMs);
    const visibleImages = (message.attachments ?? []).reduce((imageSum, image) => {
      const revealAt = image.reveal === 'speech'
        ? message.speechStartMs
        : image.reveal === 'after-text' ? message.speechEndMs : message.bubbleStartMs;
      return imageSum + interpolate(timeMs, [revealAt, revealAt + 350], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
    }, 0);
    return sum + estimatedBubbleHeight(visibleTextLength, message.role === 'user', uiScale, widthFactor, visibleImages) + 38 * uiScale;
  }, 90 * uiScale);
  const targetScroll = Math.max(0, contentBottom - chatHeight * 0.78);
  const translateY = -targetScroll;

  return (
    <AbsoluteFill style={{
      background: theme.canvas,
      fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
      color: theme.text,
      padding: `${outerTop}px ${outerX}px ${outerBottom}px`,
    }}>
      <div style={{
        height: browserHeight,
        borderRadius: 38 * layoutScale,
        overflow: 'hidden',
        background: theme.browser,
        boxShadow: '0 44px 100px rgba(31, 41, 55, 0.28)',
        border: '1px solid rgba(255,255,255,.8)',
      }}>
        <div style={{height: titleHeight, display: 'flex', alignItems: 'center', padding: `0 ${48 * layoutScale}px`, borderBottom: `2px solid ${theme.toolbarBorder}`, background: theme.browser}}>
          <div style={{width: 54 * uiScale, height: 54 * uiScale, borderRadius: 18 * uiScale, display: 'grid', placeItems: 'center', background: theme.brandGradient, color: 'white', fontSize: 28 * uiScale, fontWeight: 800}}>AI</div>
          <div style={{marginLeft: 20 * uiScale}}>
            <div style={{fontWeight: 750, fontSize: 27 * uiScale}}>{themeSettings.chatTitle || defaultProjectTheme.chatTitle}</div>
            <div style={{fontSize: 19 * uiScale, color: theme.muted, marginTop: 3 * uiScale}}>{themeSettings.chatSubtitle || defaultProjectTheme.chatSubtitle}</div>
          </div>
        </div>
        <div style={{height: chatHeight, overflow: 'hidden', position: 'relative', background: theme.chat}}>
          <div style={{padding: `${66 * layoutScale}px ${42 * layoutScale}px ${140 * layoutScale}px`, transform: `translateY(${translateY}px)`}}>
            {timeline.messages.map((message, index) => {
              if (timeMs < message.typingStartMs) return null;
              const showBubble = timeMs >= message.bubbleStartMs;
              const localFrame = Math.max(0, Math.round(((timeMs - message.bubbleStartMs) / 1000) * fps));
              const enter = spring({frame: localFrame, fps, config: {damping: 18, stiffness: 150}});
              const text = visibleTextAt(message, timeMs);
              const isUser = message.role === 'user';
              const visibleImageCount = (message.attachments ?? []).reduce((sum, image) => {
                const revealAt = image.reveal === 'speech'
                  ? message.speechStartMs
                  : image.reveal === 'after-text' ? message.speechEndMs : message.bubbleStartMs;
                return sum + interpolate(timeMs, [revealAt, revealAt + 350], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                });
              }, 0);
              const renderImages = (position: 'before-text' | 'after-text') => (message.attachments ?? [])
                .filter((image) => image.position === position)
                .map((image) => {
                  const revealAt = image.reveal === 'speech'
                    ? message.speechStartMs
                    : image.reveal === 'after-text' ? message.speechEndMs : message.bubbleStartMs;
                  if (timeMs < revealAt) return null;
                  const progress = interpolate(timeMs, [revealAt, revealAt + 350], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  });
                  return <img key={image.id} src={staticFile(image.path)} alt="" style={{
                    display: 'block',
                    width: '100%',
                    height: 320 * uiScale * progress,
                    marginBottom: position === 'before-text' ? 24 * uiScale * progress : 0,
                    marginTop: position === 'after-text' ? 24 * uiScale * progress : 0,
                    borderRadius: 18 * uiScale,
                    background: 'rgba(0,0,0,.06)',
                    objectFit: image.fit,
                    opacity: progress,
                    transform: `scale(${0.96 + progress * 0.04})`,
                  }} />;
                });
              return (
                <div key={message.id} style={{display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', marginBottom: 38 * uiScale}}>
                  <div style={{fontSize: 20 * uiScale, fontWeight: 700, color: theme.muted, margin: `0 ${16 * uiScale}px ${10 * uiScale}px`}}>{message.author}</div>
                  {!showBubble ? (
                    <div style={{background: isUser ? theme.userBubble : theme.assistantBubble, borderRadius: 25 * uiScale, padding: `${15 * uiScale}px ${24 * uiScale}px`}}><TypingDots color={theme.muted} scale={uiScale} /></div>
                  ) : (
                    <div style={{
                      maxWidth: isUser ? '76%' : '88%',
                      minHeight: estimatedBubbleHeight(progressiveTextLength(message, timeMs), isUser, uiScale, widthFactor, visibleImageCount),
                      boxSizing: 'border-box',
                      background: isUser ? theme.userBubble : theme.assistantBubble,
                      borderRadius: isUser ? '28px 28px 8px 28px' : '28px 28px 28px 8px',
                      padding: `${30 * uiScale}px ${34 * uiScale}px`,
                      fontSize: 32 * uiScale,
                      lineHeight: 1.5,
                      fontWeight: 480,
                      opacity: enter,
                      transform: `translateY(${(1 - enter) * 28}px) scale(${0.97 + enter * 0.03})`,
                      boxShadow: '0 9px 30px rgba(31,41,55,.08)',
                    }}>
                      {renderImages('before-text')}
                      <div>{text}<span style={{display: timeMs < message.speechEndMs ? 'inline-block' : 'none', width: 3 * uiScale, height: 35 * uiScale, marginLeft: 5 * uiScale, verticalAlign: -6 * uiScale, background: theme.accent, opacity: frame % 18 < 11 ? 1 : 0}} /></div>
                      {renderImages('after-text')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: 105 * layoutScale, background: `linear-gradient(transparent, ${theme.chat})`}} />
        </div>
      </div>
      {timeline.messages.map((message) => (
        message.take.audioPath ? (
        <Sequence
          key={message.take.id}
          from={Math.round((message.speechStartMs * fps) / 1000)}
          durationInFrames={Math.ceil((message.take.durationMs * fps) / 1000)}
        >
          <Audio src={staticFile(message.take.audioPath)} volume={0.32} />
        </Sequence>
        ) : null
      ))}
    </AbsoluteFill>
  );
};

export const composition = {
  id: 'ChatVideoPrototype',
  width: getVideoDimensions(prototypeProject.video).width,
  height: getVideoDimensions(prototypeProject.video).height,
  fps: prototypeProject.fps,
  durationInFrames: compileTimeline(prototypeProject).durationInFrames,
};
