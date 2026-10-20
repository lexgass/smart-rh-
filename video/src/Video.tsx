import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, Series, interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from "remotion";

const C = { vert: "#0B3D2E", vert2: "#14614A", menthe: "#E6F2EC", or: "#F2B705", rouge: "#C8452C", encre: "#14211C", gris: "#5C6B65", trait: "#D9E2DD", fond: "#F6F9F7" };
const POLICE = '"Segoe UI", Arial, sans-serif';

// durées des scènes, en images (30 par seconde)
// calées sur la longueur de la voix off de chaque scène
const S = { intro: 186, probleme: 416, changement: 354, solution: 354, produit: 322, marche: 249, finances: 240, demande: 330 };
const FONDU = 12;
export const DUREE = Object.values(S).reduce((a, b) => a + b, 0);

const fr = (n: number) => Math.round(n).toLocaleString("fr-FR").replace(/ | /g, " ");

// apparition : glisse vers le haut en s'affichant
const Entree: React.FC<{ a: number; children: React.ReactNode; style?: React.CSSProperties; dy?: number }> = ({ a, children, style, dy = 40 }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: f - a, fps, config: { damping: 200 } });
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * dy}px)`, ...style }}>{children}</div>;
};

// enveloppe de scène : fondu d'entrée et de sortie
const Scene: React.FC<{ d: number; sombre?: boolean; children: React.ReactNode }> = ({ d, sombre, children }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, FONDU, d - FONDU, d], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: sombre ? C.vert : "#fff", color: sombre ? "#fff" : C.encre, fontFamily: POLICE }}>
      <AbsoluteFill style={{ opacity: o, padding: "90px 120px", justifyContent: "center" }}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
};

const Sur: React.FC<{ children: React.ReactNode; sombre?: boolean }> = ({ children, sombre }) => (
  <Entree a={4}>
    <div style={{ fontSize: 26, letterSpacing: 6, textTransform: "uppercase", fontWeight: 600, color: sombre ? C.or : C.vert2, marginBottom: 18 }}>{children}</div>
  </Entree>
);

const Titre: React.FC<{ children: React.ReactNode; sombre?: boolean; taille?: number }> = ({ children, sombre, taille = 76 }) => (
  <Entree a={10}>
    <div style={{ fontSize: taille, lineHeight: 1.1, fontWeight: 700, letterSpacing: -1.5, color: sombre ? "#fff" : C.vert, maxWidth: 1500 }}>{children}</div>
  </Entree>
);

const Logo: React.FC<{ taille?: number }> = ({ taille = 1 }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 22 * taille, fontSize: 44 * taille, fontWeight: 700 }}>
    <div style={{ width: 76 * taille, height: 76 * taille, borderRadius: 20 * taille, background: C.or, color: C.vert, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>S</div>
    Smart RH
  </div>
);

const Rond: React.FC<{ t: number; x: number; y: number; c: string; a?: number; o?: number }> = ({ t, x, y, c, a = 0, o = 1 }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: f - a, fps, config: { damping: 30, mass: 1.4 } });
  const derive = Math.sin(f / 40) * 14;
  return <div style={{ position: "absolute", width: t, height: t, left: x, top: y + derive, borderRadius: "50%", background: c, opacity: o, transform: `scale(${p})` }} />;
};

/* 1 — Ouverture */
const Intro: React.FC = () => (
  <Scene d={S.intro} sombre>
    <Rond t={1100} x={1150} y={120} c={C.vert2} o={0.6} />
    <Rond t={360} x={1380} y={560} c={C.or} a={10} />
    <AbsoluteFill style={{ padding: "90px 120px", justifyContent: "center" }}>
      <Entree a={8}><Logo taille={1.5} /></Entree>
      <Entree a={24} style={{ marginTop: 60 }}>
        <div style={{ fontSize: 92, fontWeight: 700, lineHeight: 1.06, letterSpacing: -2, maxWidth: 1150 }}>
          La paie et les RH des PME congolaises, <span style={{ color: C.or }}>enfin simples.</span>
        </div>
      </Entree>
    </AbsoluteFill>
  </Scene>
);

/* 2 — Le problème */
const PRELEVEMENTS = ["Retraite", "Prestations familiales", "Accidents du travail", "Assurance maladie", "Taxe sur les salaires", "Impôt sur les salaires"];
const Probleme: React.FC = () => (
  <Scene d={S.probleme}>
    <Sur>Le problème</Sur>
    <Titre>Chaque mois, un seul salaire, six prélèvements à calculer.</Titre>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 30, marginTop: 70 }}>
      {PRELEVEMENTS.map((t, i) => (
        <Entree key={t} a={110 + i * 28}>
          <div style={{ background: C.fond, borderRadius: 26, padding: "38px 40px", display: "flex", alignItems: "center", gap: 26 }}>
            <div style={{ width: 70, height: 70, borderRadius: "50%", background: C.vert, color: C.or, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
            <div style={{ fontSize: 38, fontWeight: 600, color: C.vert, lineHeight: 1.15 }}>{t}</div>
          </div>
        </Entree>
      ))}
    </div>
    <Entree a={310} style={{ marginTop: 56 }}>
      <div style={{ fontSize: 40, color: C.gris }}>Aujourd'hui, la plupart des PME font tout cela sur Excel.</div>
    </Entree>
  </Scene>
);

/* 3 — Les règles changent */
const Changement: React.FC = () => {
  const f = useCurrentFrame();
  const smig = interpolate(f, [100, 170], [50400, 70400], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const barre = interpolate(f, [240, 260], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Scene d={S.changement} sombre>
      <Sur sombre>Pourquoi maintenant</Sur>
      <Titre sombre>Et les règles viennent de changer.</Titre>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, marginTop: 80 }}>
        <Entree a={70}>
          <div style={{ background: C.vert2, borderRadius: 30, padding: "50px 56px", height: 420 }}>
            <div style={{ fontSize: 32, opacity: 0.9 }}>Salaire minimum (SMIG), janvier 2025</div>
            <div style={{ fontSize: 150, fontWeight: 700, color: C.or, letterSpacing: -3, lineHeight: 1.15, fontVariantNumeric: "tabular-nums" }}>{fr(smig)}</div>
            <div style={{ fontSize: 34, opacity: 0.9 }}>FCFA par mois, contre 50 400 auparavant</div>
          </div>
        </Entree>
        <Entree a={215}>
          <div style={{ background: C.vert2, borderRadius: 30, padding: "50px 56px", height: 420 }}>
            <div style={{ fontSize: 32, opacity: 0.9 }}>Impôt sur les salaires, loi de finances 2026</div>
            <div style={{ display: "flex", alignItems: "center", gap: 40, fontSize: 130, fontWeight: 700, lineHeight: 1.3, letterSpacing: -2 }}>
              <span style={{ position: "relative", opacity: 0.6 }}>
                IRPP
                <span style={{ position: "absolute", left: -10, top: "52%", height: 10, borderRadius: 5, background: C.rouge, width: `${barre * 108}%` }} />
              </span>
              <span style={{ color: C.or, opacity: interpolate(f, [262, 282], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>ITS</span>
            </div>
            <div style={{ fontSize: 34, opacity: 0.9 }}>Un nouvel impôt, un nouveau barème</div>
          </div>
        </Entree>
      </div>
    </Scene>
  );
};

/* 4 — La solution */
const REGLES: [string, string, string, "old" | "ok" | "new"][] = [
  ["SMIG mensuel", "50 400 FCFA", "jusqu'au 31/12/2024", "old"],
  ["SMIG mensuel", "70 400 FCFA", "depuis le 01/01/2025", "ok"],
  ["Retraite CNSS, salarié", "4 %", "depuis le 01/01/2023", "ok"],
  ["Assurance maladie, salarié", "2,27 %", "depuis le 01/01/2023", "ok"],
  ["Impôt sur les salaires (ITS)", "barème 5 tranches", "depuis le 01/01/2026", "new"],
];
const ETAT = { old: ["Archivée", "#EEF0EF", C.gris], ok: ["Active", C.menthe, C.vert2], new: ["Nouvelle", "#FFF1C2", "#7A5A00"] } as const;
const Solution: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Scene d={S.solution}>
      <div style={{ display: "grid", gridTemplateColumns: "560px 1fr", gap: 70, alignItems: "center", height: "100%" }}>
        <div>
          <Sur>La solution</Sur>
          <Titre taille={60}>Chaque règle se paramètre à l'écran, avec sa date d'effet.</Titre>
          <Entree a={200} style={{ marginTop: 44 }}>
            <div style={{ fontSize: 38, color: C.gris, lineHeight: 1.35 }}>Une loi change ? On ajoute une ligne. Sans développeur.</div>
          </Entree>
        </div>
        <Entree a={24} dy={80}>
          <div style={{ background: "#fff", borderRadius: 26, overflow: "hidden", border: `2px solid ${C.trait}`, boxShadow: "0 30px 80px rgba(11,61,46,.22)" }}>
            <div style={{ background: C.vert, color: "#fff", padding: "22px 32px", fontSize: 26, fontWeight: 600, display: "flex", justifyContent: "space-between" }}>
              <span>Paramètres de paie · Modèle Congo</span>
              <span style={{ opacity: 0.8, fontWeight: 400 }}>Exemple SARL</span>
            </div>
            {REGLES.map(([nom, val, date, etat], i) => {
              const a = etat === "new" ? 205 : 50 + i * 26;
              const p = spring({ frame: f - a, fps, config: { damping: 200 } });
              const neuf = etat === "new";
              const eclat = neuf ? interpolate(f, [a, a + 20, a + 70], [0, 1, 0.35], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
              return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1.7fr 1.1fr 1.2fr 140px", alignItems: "center", gap: 16, padding: "26px 32px", borderTop: `2px solid ${C.trait}`, fontSize: 22, whiteSpace: "nowrap", opacity: p, transform: `translateX(${(1 - p) * 60}px)`, background: `rgba(242,183,5,${eclat * 0.22})` }}>
                  <span>{nom}</span>
                  <span style={{ textAlign: "right", fontWeight: 700 }}>{val}</span>
                  <span style={{ color: C.gris }}>{date}</span>
                  <span style={{ background: ETAT[etat][1], color: ETAT[etat][2], borderRadius: 30, padding: "6px 0", textAlign: "center", fontSize: 19, fontWeight: 600 }}>{ETAT[etat][0]}</span>
                </div>
              );
            })}
          </div>
        </Entree>
      </div>
    </Scene>
  );
};

/* 5 — Le produit */
const ETAPES: [string, string][] = [
  ["Embauche", "Dossier, contrat, période d'essai"],
  ["Dotations", "Matériel remis et restitué"],
  ["Paie", "Bulletins et déclarations"],
  ["Vie du contrat", "Congés, avenants, sortie"],
];
const Produit: React.FC = () => {
  const f = useCurrentFrame();
  const ligne = interpolate(f, [50, 165], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  return (
    <Scene d={S.produit}>
      <Sur>Le produit</Sur>
      <Titre>Tout le cycle de vie du salarié dans un seul outil.</Titre>
      <div style={{ position: "relative", marginTop: 90 }}>
        <div style={{ position: "absolute", left: 60, right: 60, top: 48, height: 8, borderRadius: 4, background: C.trait }}>
          <div style={{ width: `${ligne}%`, height: "100%", borderRadius: 4, background: C.or }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 30, position: "relative" }}>
          {ETAPES.map(([t, d], i) => (
            <Entree key={t} a={50 + i * 36}>
              <div style={{ width: 104, height: 104, borderRadius: "50%", background: C.vert, color: C.or, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48, fontWeight: 700, border: "8px solid #fff" }}>{i + 1}</div>
              <div style={{ fontSize: 46, fontWeight: 700, color: C.vert, marginTop: 26 }}>{t}</div>
              <div style={{ fontSize: 32, color: C.gris, marginTop: 10, lineHeight: 1.3 }}>{d}</div>
            </Entree>
          ))}
        </div>
      </div>
      <Entree a={215} style={{ marginTop: 70 }}>
        <div style={{ display: "flex", gap: 30 }}>
          {["Plusieurs sociétés dans une seule installation", "Fonctionne sans internet"].map((t) => (
            <div key={t} style={{ background: C.vert, color: "#fff", borderRadius: 60, padding: "24px 44px", fontSize: 34, fontWeight: 600 }}>{t}</div>
          ))}
        </div>
      </Entree>
    </Scene>
  );
};

/* 6 — Le marché */
const Compteur: React.FC<{ a: number; v: number; prefixe?: string; suffixe?: string; l: string }> = ({ a, v, prefixe = "", suffixe = "", l }) => {
  const f = useCurrentFrame();
  const n = interpolate(f, [a, a + 50], [0, v], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return (
    <Entree a={a}>
      <div style={{ background: C.vert2, borderRadius: 30, padding: "50px 50px", height: 380 }}>
        <div style={{ fontSize: 120, fontWeight: 700, color: C.or, letterSpacing: -3, lineHeight: 1.1, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{prefixe}{fr(n)}{suffixe}</div>
        <div style={{ fontSize: 36, marginTop: 22, lineHeight: 1.3, opacity: 0.94 }}>{l}</div>
      </div>
    </Entree>
  );
};
const Marche: React.FC = () => (
  <Scene d={S.marche} sombre>
    <Sur sombre>Le marché</Sur>
    <Titre sombre>Des milliers d'entreprises tenues de produire une paie.</Titre>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 36, marginTop: 80 }}>
      <Compteur a={45} v={6400} prefixe="≈ " l="entreprises formelles au Congo" />
      <Compteur a={105} v={5827} l="entreprises créées en 2025" />
      <Compteur a={160} v={80} suffixe=" %" l="des entreprises formelles sont des PME" />
    </div>
  </Scene>
);

/* 7 — Les finances */
const BARRES: [string, number, number][] = [["Année 1", 12.3, 58], ["Année 2", 70.3, 100], ["Année 3", 243, 160]];
const Finances: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const H = 520;
  return (
    <Scene d={S.finances}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 560px", gap: 80, height: "100%" }}>
        <div>
          <Sur>Prévisions</Sur>
          <Titre taille={66}>Bénéficiaire dès la troisième année.</Titre>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 70, height: H, marginTop: 70, borderBottom: `4px solid ${C.trait}`, padding: "0 40px" }}>
            {BARRES.map(([an, ca, ch], i) => {
              const p = spring({ frame: f - 40 - i * 22, fps, config: { damping: 200 }, durationInFrames: 40 });
              return (
                <div key={an} style={{ flex: 1, display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 20, height: "100%" }}>
                  {[[ca, C.vert2, C.vert2], [ch, "#B9C7C0", C.gris]].map(([v, bg, coul], j) => (
                    <div key={j} style={{ width: 110, height: ((v as number) / 243) * (H - 70) * p, background: bg as string, borderRadius: "12px 12px 0 0", position: "relative" }}>
                      <div style={{ position: "absolute", top: -50, left: -40, right: -40, textAlign: "center", fontSize: 32, fontWeight: 700, color: coul as string, opacity: p }}>{String(v).replace(".", ",")}</div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 70, padding: "16px 40px 0", fontSize: 30, color: C.gris }}>
            {BARRES.map(([an]) => <div key={an} style={{ flex: 1, textAlign: "center" }}>{an}</div>)}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 30 }}>
          <Entree a={110}>
            <div style={{ background: C.vert, color: "#fff", borderRadius: 30, padding: "44px 48px" }}>
              <div style={{ fontSize: 104, fontWeight: 700, color: C.or, lineHeight: 1, letterSpacing: -2 }}>+83 M</div>
              <div style={{ fontSize: 32, marginTop: 16, lineHeight: 1.3 }}>FCFA de résultat en année 3</div>
            </div>
          </Entree>
          <Entree a={130}>
            <div style={{ fontSize: 28, color: C.gris, lineHeight: 1.4 }}>En millions de FCFA.<br /><b style={{ color: C.vert2 }}>■</b> chiffre d'affaires <b style={{ color: "#B9C7C0" }}>■</b> charges<br />Prévisions fondées sur des hypothèses.</div>
          </Entree>
        </div>
      </div>
    </Scene>
  );
};

/* 8 — La demande */
const Demande: React.FC = () => {
  const f = useCurrentFrame();
  const n = interpolate(f, [24, 80], [0, 90], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return (
    <Scene d={S.demande} sombre>
      <Rond t={900} x={-300} y={520} c={C.vert2} o={0.6} />
      <Rond t={260} x={1500} y={120} c={C.or} a={8} />
      <AbsoluteFill style={{ padding: "90px 120px", justifyContent: "center" }}>
        <Sur sombre>Notre demande</Sur>
        <Entree a={16}>
          <div style={{ fontSize: 210, fontWeight: 700, color: C.or, letterSpacing: -6, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{fr(n)} millions</div>
        </Entree>
        <Entree a={50}>
          <div style={{ fontSize: 54, fontWeight: 600, marginTop: 20, maxWidth: 1300, lineHeight: 1.2 }}>de FCFA pour lancer Smart RH et atteindre 400 sociétés clientes en trois ans.</div>
        </Entree>
        <Entree a={130} style={{ marginTop: 80 }}><Logo /></Entree>
        <Entree a={150} style={{ marginTop: 24 }}>
          <div style={{ fontSize: 36, opacity: 0.9 }}>La suite de gestion des PME congolaises : RH, facturation, CRM.</div>
        </Entree>
      </AbsoluteFill>
    </Scene>
  );
};

export const SmartRH: React.FC = () => (
  <AbsoluteFill style={{ background: C.vert }}>
    <Audio src={staticFile("musique.wav")} volume={(f) => 0.09 * interpolate(f, [0, 30, DUREE - 75, DUREE - 5], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />
    <Series>
      <Series.Sequence durationInFrames={S.intro}><Intro /><Sequence from={15}><Audio src={staticFile("voix/1.mp3")} volume={1.6} /></Sequence></Series.Sequence>
      <Series.Sequence durationInFrames={S.probleme}><Probleme /><Sequence from={15}><Audio src={staticFile("voix/2.mp3")} volume={1.6} /></Sequence></Series.Sequence>
      <Series.Sequence durationInFrames={S.changement}><Changement /><Sequence from={15}><Audio src={staticFile("voix/3.mp3")} volume={1.6} /></Sequence></Series.Sequence>
      <Series.Sequence durationInFrames={S.solution}><Solution /><Sequence from={15}><Audio src={staticFile("voix/4.mp3")} volume={1.6} /></Sequence></Series.Sequence>
      <Series.Sequence durationInFrames={S.produit}><Produit /><Sequence from={15}><Audio src={staticFile("voix/5.mp3")} volume={1.6} /></Sequence></Series.Sequence>
      <Series.Sequence durationInFrames={S.marche}><Marche /><Sequence from={15}><Audio src={staticFile("voix/6.mp3")} volume={1.6} /></Sequence></Series.Sequence>
      <Series.Sequence durationInFrames={S.finances}><Finances /><Sequence from={15}><Audio src={staticFile("voix/7.mp3")} volume={1.6} /></Sequence></Series.Sequence>
      <Series.Sequence durationInFrames={S.demande}><Demande /><Sequence from={15}><Audio src={staticFile("voix/8.mp3")} volume={1.6} /></Sequence></Series.Sequence>
    </Series>
  </AbsoluteFill>
);
