// Vidéo de démonstration détaillée de Smart RH : écrans réels de l'application, narration par scène (français ou lingala).
import React from "react";
import { AbsoluteFill, Audio, Img, Loop, Sequence, Series, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing, CalculateMetadataFunction } from "remotion";
import scenes from "../scenes-demo.json";

export type Langue = "fr" | "ln";
export type DemoProps = { langue: Langue; durees?: Record<string, number> };

const FPS = 30;
const MARGE = 1.1; // secondes de respiration après chaque narration
const VITESSE: Record<Langue, number> = { fr: 1, ln: 1.25 }; // la voix lingala est accélérée sans changer sa hauteur
const EXT: Record<Langue, string> = { fr: "mp3", ln: "wav" };
const C = { foret: "#123F33", foret2: "#1B5A48", action: "#17694F", raphia: "#D9A441", fond: "#F3F5F2", encre: "#17211D", gris: "#5E6A64", trait: "#E2E7E3" };
const POLICES = `
@font-face{font-family:'Sora';font-weight:600 800;src:url('${staticFile("marque/fonts/sora-latin.woff2")}') format('woff2');}
@font-face{font-family:'Manrope';font-weight:400 800;src:url('${staticFile("marque/fonts/manrope-latin.woff2")}') format('woff2');}`;
const TITRE = "'Sora', 'Segoe UI', sans-serif", TEXTE = "'Manrope', 'Segoe UI', sans-serif";

type Scene = (typeof scenes)[number] & { zoom?: number[]; sous?: { fr: string; ln: string } };
const LISTE = scenes as Scene[];
const framesDe = (id: string, langue: Langue, durees: Record<string, number>) => Math.ceil(((durees[id] ?? 8) / VITESSE[langue] + MARGE) * FPS);

export const calculerMetadonnees: CalculateMetadataFunction<DemoProps> = async ({ props }) => {
  const durees = await (await fetch(staticFile(`demo-voix/${props.langue}/durees.json`))).json();
  const total = LISTE.reduce((a, s) => a + framesDe(s.id, props.langue, durees), 0);
  return { durationInFrames: total, props: { ...props, durees } };
};

const Apparition: React.FC<{ a: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ a, children, style }) => {
  const f = useCurrentFrame(), { fps } = useVideoConfig();
  const p = spring({ frame: f - a, fps, config: { damping: 200 } });
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * 30}px)`, ...style }}>{children}</div>;
};

// fond de marque : vert forêt et motif losange
const FondMarque: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.foret, color: "#fff", fontFamily: TEXTE }}>
      <AbsoluteFill style={{ backgroundImage: `url(${staticFile("marque/motif.svg")})`, backgroundSize: "84px 84px", opacity: 0.35, backgroundPosition: `${f * 0.3}px ${f * 0.15}px`,
        WebkitMaskImage: "radial-gradient(circle at 85% 80%, #000, transparent 70%)", maskImage: "radial-gradient(circle at 85% 80%, #000, transparent 70%)" }} />
      <AbsoluteFill style={{ padding: "110px 140px", justifyContent: "center" }}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
};
const Marque: React.FC<{ taille?: number }> = ({ taille = 1 }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 18 * taille, fontFamily: TITRE, fontWeight: 700, fontSize: 40 * taille }}>
    <Img src={staticFile("marque/logo.svg")} style={{ width: 70 * taille, height: 70 * taille, borderRadius: 18 * taille }} />
    <span>Smart <span style={{ color: C.raphia }}>RH</span></span>
  </div>
);

const SceneTitre: React.FC<{ s: Scene; langue: Langue }> = ({ s, langue }) => (
  <FondMarque>
    <Apparition a={4}><Marque taille={s.id === "intro" || s.id === "fin" ? 1.3 : 0.8} /></Apparition>
    {s.id !== "intro" && s.id !== "fin" && (
      <Apparition a={10} style={{ marginTop: 70 }}><div style={{ fontFamily: TITRE, fontWeight: 800, fontSize: 96, letterSpacing: -2, lineHeight: 1.05, maxWidth: 1400 }}>{s.titre[langue]}</div></Apparition>
    )}
    {s.sous && (
      <Apparition a={22} style={{ marginTop: s.id === "intro" || s.id === "fin" ? 60 : 36 }}>
        <div style={{ fontFamily: s.id === "intro" || s.id === "fin" ? TITRE : TEXTE, fontWeight: s.id === "intro" || s.id === "fin" ? 800 : 500, fontSize: s.id === "intro" || s.id === "fin" ? 82 : 44, lineHeight: 1.15, maxWidth: 1500, color: s.id === "intro" || s.id === "fin" ? "#fff" : "#C9DAD2", letterSpacing: s.id === "intro" ? -1.5 : 0 }}>{s.sous[langue]}</div>
      </Apparition>
    )}
    {s.id === "probleme" && <Prelevements />}
  </FondMarque>
);

const PRELEVEMENTS = ["Retraite CNSS", "Prestations familiales", "Accidents du travail", "Assurance maladie CAMU", "Taxe unique sur les salaires", "Taxe d'occupation des locaux", "Impôt sur les salaires (ITS)"];
const Prelevements: React.FC = () => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 70, maxWidth: 1560 }}>
    {PRELEVEMENTS.map((t, i) => (
      <Apparition key={t} a={50 + i * 22}><div style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(217,164,65,.45)", borderRadius: 60, padding: "16px 30px", fontSize: 32, fontWeight: 600 }}>{t}</div></Apparition>
    ))}
  </div>
);

// écran de l'application dans une fenêtre de navigateur, avec un lent zoom vers la zone commentée
const SceneEcran: React.FC<{ s: Scene; langue: Langue; duree: number; index: number; total: number }> = ({ s, langue, duree, index, total }) => {
  const f = useCurrentFrame();
  const [x1, y1, x2, y2] = s.zoom ?? [0, 0, 1, 1];
  const p = interpolate(f, [18, duree - 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  const L = 1600, H = 900; // taille de l'écran dans la fenêtre
  const echelleFin = Math.min(1 / (x2 - x1), 1 / (y2 - y1), 2.1);
  const echelle = 1 + (echelleFin - 1) * p;
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
  const entree = spring({ frame: f, fps: FPS, config: { damping: 200 } });
  return (
    <AbsoluteFill style={{ background: C.fond, fontFamily: TEXTE }}>
      <AbsoluteFill style={{ background: `radial-gradient(circle at 20% 0%, #E5F1EB, ${C.fond} 60%)` }} />
      <div style={{ position: "absolute", left: 160, top: 60, width: L, opacity: entree, transform: `translateY(${(1 - entree) * 40}px)` }}>
        <div style={{ borderRadius: 18, overflow: "hidden", boxShadow: "0 40px 90px -30px rgba(18,63,51,.55)", border: `1px solid ${C.trait}`, background: "#fff" }}>
          <div style={{ height: 44, background: "#E9EEEA", display: "flex", alignItems: "center", gap: 10, padding: "0 18px" }}>
            {["#E0715F", "#E8B64C", "#5DB27A"].map((c) => <span key={c} style={{ width: 13, height: 13, borderRadius: "50%", background: c }} />)}
            <span style={{ marginLeft: 20, background: "#fff", borderRadius: 8, padding: "5px 16px", fontSize: 18, color: C.gris }}>localhost:4322</span>
          </div>
          <div style={{ width: L, height: H, overflow: "hidden", position: "relative" }}>
            <Img src={staticFile(`demo/${s.image}.png`)} style={{ width: L, height: H, objectFit: "cover", objectPosition: "top left", transformOrigin: `${cx * 100}% ${cy * 100}%`, transform: `scale(${echelle})` }} />
          </div>
        </div>
      </div>
      <Apparition a={14} style={{ position: "absolute", left: 120, bottom: 70 }}>
        <div style={{ background: C.foret, color: "#fff", borderRadius: 18, padding: "20px 34px", display: "flex", alignItems: "center", gap: 20, boxShadow: "0 20px 40px -18px rgba(18,63,51,.7)" }}>
          <span style={{ width: 18, height: 18, background: C.raphia, transform: "rotate(45deg)", borderRadius: 3 }} />
          <span style={{ fontFamily: TITRE, fontWeight: 700, fontSize: 40 }}>{s.titre[langue]}</span>
        </div>
      </Apparition>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 8, background: "#DCE5E0" }}>
        <div style={{ height: "100%", width: `${((index + p) / total) * 100}%`, background: C.raphia }} />
      </div>
    </AbsoluteFill>
  );
};

export const Demo: React.FC<DemoProps> = ({ langue, durees = {} }) => {
  const ecrans = LISTE.filter((s) => s.image);
  return (
    <AbsoluteFill style={{ background: C.foret }}>
      <style>{POLICES}</style>
      <Loop durationInFrames={84 * FPS}>
        <Audio src={staticFile("musique.wav")} volume={(f) => 0.07 * interpolate(f, [0, 45], [0, 1], { extrapolateRight: "clamp" })} />
      </Loop>
      <Series>
        {LISTE.map((s) => {
          const d = framesDe(s.id, langue, durees);
          return (
            <Series.Sequence key={s.id} durationInFrames={d}>
              {s.image ? <SceneEcran s={s} langue={langue} duree={d} index={ecrans.indexOf(s)} total={ecrans.length} /> : <SceneTitre s={s} langue={langue} />}
              <Sequence from={12}><Audio src={staticFile(`demo-voix/${langue}/${s.id}.${EXT[langue]}`)} playbackRate={VITESSE[langue]} volume={1.5} /></Sequence>
            </Series.Sequence>
          );
        })}
      </Series>
    </AbsoluteFill>
  );
};
