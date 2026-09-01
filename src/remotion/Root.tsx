import React from 'react';
import {Composition} from 'remotion';
import {ChatVideo, composition, type ChatVideoProps} from './ChatVideo';
import {prototypeProject} from '../data/prototype-project';
import {compileTimeline} from '../domain/timeline';
import {getVideoDimensions} from '../domain/video';

export const RemotionRoot: React.FC = () => (
  <Composition
    id={composition.id}
    component={ChatVideo}
    defaultProps={{project: prototypeProject}}
    durationInFrames={composition.durationInFrames}
    fps={composition.fps}
    width={composition.width}
    height={composition.height}
    calculateMetadata={({props}) => {
      const project = (props as ChatVideoProps).project ?? prototypeProject;
      const dimensions = getVideoDimensions(project.video);
      return {
        width: dimensions.width,
        height: dimensions.height,
        fps: project.fps,
        durationInFrames: compileTimeline(project).durationInFrames,
      };
    }}
  />
);
