import React from "react";
import { Composition } from "remotion";
import { SmartRH, DUREE } from "./Video";
import { Demo, calculerMetadonnees } from "./Demo";

export const Root: React.FC = () => (
  <>
    <Composition id="SmartRH" component={SmartRH} durationInFrames={DUREE} fps={30} width={1920} height={1080} />
    <Composition id="DemoFR" component={Demo} defaultProps={{ langue: "fr" as const }} calculateMetadata={calculerMetadonnees} durationInFrames={300} fps={30} width={1920} height={1080} />
    <Composition id="DemoLN" component={Demo} defaultProps={{ langue: "ln" as const }} calculateMetadata={calculerMetadonnees} durationInFrames={300} fps={30} width={1920} height={1080} />
  </>
);
