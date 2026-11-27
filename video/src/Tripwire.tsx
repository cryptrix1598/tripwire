import React from 'react';
import {AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';

// Tripwire's own palette (src/ui/tripwire.css): calm deep blue, one warm signal, one green for "private".
const GROUND = '#EEF3F6';
const SURFACE = '#FFFFFF';
const INK = '#0E2233';
const TEXT2 = '#34495A';
const DEEP = '#14344D';
const LINE = '#C9D6DE';
const SIGNAL = '#F0B429';
const OK = '#17553B';
const FONT = 'Atkinson, system-ui, sans-serif';

// One rule, borrowed from the Ferrari film: every scene ends on the shape the next one starts with.
//   card field -> pause card; shield -> "nothing left your computer" dot; dot -> the caller on a phone;
//   "Hang up now" pill -> the family alert; alert -> the line under the wordmark.
const r = (f: number, a: number, b: number) => Math.min(1, Math.max(0, (f - a) / (b - a)));
const out = Easing.bezier(0.16, 1, 0.3, 1);
const inOut = Easing.bezier(0.65, 0, 0.35, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const Caption: React.FC<{text: string; from: number; to: number}> = ({text, from, to}) => {
  const f = useCurrentFrame();
  const o = r(f, from, from + 10) * (1 - r(f, to - 8, to));
  if (o <= 0) return null;
  return (
    <div style={{position: 'absolute', left: 120, top: 96, fontFamily: FONT, fontWeight: 700, fontSize: 44, color: INK, opacity: o, transform: `translateY(${(1 - out(r(f, from, from + 14))) * 16}px)`}}>
      {text}
    </div>
  );
};

const Cursor: React.FC<{x: number; y: number; o: number}> = ({x, y, o}) => (
  <svg width={44} height={56} style={{position: 'absolute', left: x - 6, top: y - 4, opacity: o, filter: 'drop-shadow(0 6px 10px rgba(14,34,51,0.25))'}}>
    <path d="M6 4 L6 44 L16 34 L24 52 L31 49 L23 31 L38 31 Z" fill={INK} stroke="#fff" strokeWidth={2.5} strokeLinejoin="round" />
  </svg>
);

const Shield: React.FC<{size: number; draw: number; fill: number; color: string}> = ({size, draw, fill, color}) => (
  <svg width={size} height={size} viewBox="0 0 100 100" style={{display: 'block'}}>
    <path
      d="M50 8 L84 21 V48 C84 70 69 85 50 92 C31 85 16 70 16 48 V21 Z"
      pathLength={1}
      strokeDasharray="1 1"
      strokeDashoffset={1 - draw}
      fill={color}
      fillOpacity={fill}
      stroke={color}
      strokeWidth={6}
      strokeLinejoin="round"
    />
    <path d="M36 50 L46 60 L66 39" fill="none" stroke={GROUND} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" opacity={fill} />
  </svg>
);

export const Tripwire: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();

  // ── 1. The moment of action: a card field, a cursor, a click ─────────────────────────────
  const fieldIn = out(r(f, 0, 18));
  const cur = inOut(r(f, 14, 44));
  const click = f >= 46;
  const ripple = r(f, 46, 62);
  const focus = r(f, 46, 52);

  // ── field -> pause card ───────────────────────────────────────────────────────────────────
  const m = inOut(r(f, 58, 92));
  const card = {
    cx: 960,
    cy: lerp(560, 540, m),
    w: lerp(760, 1120, m),
    h: lerp(96, 640, m),
    rad: lerp(16, 30, m),
  };
  const band = out(r(f, 78, 98)) * 160;
  const fieldText = 1 - r(f, 58, 64);

  // ── 2. The pause ──────────────────────────────────────────────────────────────────────────
  const shieldDraw = out(r(f, 92, 110));
  const shieldFill = r(f, 106, 114);
  const head = out(r(f, 102, 124));
  const sub = r(f, 116, 130);
  const btn = spring({frame: f - 124, fps, config: {damping: 14, stiffness: 180}});

  // ── shield -> green dot on the route line, then zoom in on it ─────────────────────────────
  const top = card.cy - card.h / 2;
  const s2d = inOut(r(f, 146, 172));
  const shieldX = lerp(960, 960 - 300, s2d);
  const shieldY = lerp(top + 80, top + 556, s2d);
  const shieldSize = lerp(96, 22, s2d);
  const route = r(f, 166, 188);
  const zoom = inOut(r(f, 182, 214));
  const scale = lerp(1, 2.1, zoom);
  // keep the dot drifting to the middle of the frame as the camera closes in
  const camX = lerp(0, 960 - (960 - 300), zoom);
  const camY = lerp(0, 470 - (top + 556), zoom);
  const cardFade = 1 - r(f, 214, 226);
  const restFade = 1 - 0.75 * r(f, 182, 200);

  // ── 3. dot -> the caller on a phone ───────────────────────────────────────────────────────
  const grow = out(r(f, 216, 240));
  const avatarR = lerp(11, 112, grow);
  const avatarColor = r(f, 224, 236);
  const phone = out(r(f, 222, 246));
  const callText = r(f, 236, 248);
  const chip1 = spring({frame: f - 244, fps, config: {damping: 15, stiffness: 200}});
  const chip2 = spring({frame: f - 250, fps, config: {damping: 15, stiffness: 200}});
  const tap = r(f, 260, 268);
  const pillUp = spring({frame: f - 270, fps, config: {damping: 13, stiffness: 170}});

  // ── 4. "Hang up now" pill -> the family alert ─────────────────────────────────────────────
  const fly = inOut(r(f, 300, 328));
  const phoneX = lerp(960, 600, inOut(r(f, 290, 316)));
  const phoneO = 1 - 0.65 * r(f, 290, 316);
  const pill = {
    cx: lerp(phoneX, 1300, fly),
    cy: lerp(lerp(1000, 838, pillUp), 520, fly),
    w: lerp(330, 600, fly),
    h: lerp(84, 250, fly),
    rad: lerp(42, 22, fly),
  };
  const alertText = r(f, 324, 338);

  // ── 5. alert -> a line -> the wordmark ────────────────────────────────────────────────────
  const fold = inOut(r(f, 354, 378));
  const endPhone = 1 - r(f, 346, 358);
  const line = {cx: lerp(pill.cx, 960, fold), cy: lerp(pill.cy, 640, fold), w: lerp(pill.w, 560, fold), h: lerp(pill.h, 6, fold), rad: lerp(pill.rad, 3, fold)};
  const word = out(r(f, 374, 396));
  const tag = r(f, 392, 404);
  const tag2 = r(f, 400, 412);

  const showCard = f < 226;
  const showPhone = f >= 214 && f < 358;
  const pillStage = f >= 270;

  return (
    <AbsoluteFill style={{background: GROUND, fontFamily: FONT, color: INK, overflow: 'hidden'}}>
      {/* a quiet dot grid, like paper */}
      <AbsoluteFill style={{backgroundImage: `radial-gradient(${LINE} 1.2px, transparent 1.2px)`, backgroundSize: '36px 36px', opacity: 0.55}} />

      {showCard && (
        <AbsoluteFill style={{transform: `translate(${camX}px, ${camY}px) scale(${scale})`, transformOrigin: `${960 - 300}px ${top + 556}px`, opacity: cardFade}}>
          {/* the field, which becomes the card */}
          <div
            style={{
              position: 'absolute',
              left: card.cx - card.w / 2,
              top: card.cy - card.h / 2,
              width: card.w,
              height: card.h,
              borderRadius: card.rad,
              background: SURFACE,
              border: `${lerp(2, 0, m)}px solid ${focus > 0.5 && m < 0.2 ? DEEP : LINE}`,
              boxShadow: `0 ${lerp(2, 30, m)}px ${lerp(6, 80, m)}px rgba(14,34,51,${lerp(0.06, 0.16, m)})`,
              overflow: 'hidden',
              opacity: fieldIn,
              transform: `scaleY(${lerp(0.7, 1, fieldIn)})`,
            }}
          >
            <div style={{position: 'absolute', left: 0, right: 0, top: 0, height: band, background: DEEP}} />
            <div style={{position: 'absolute', left: 34, top: 26, fontSize: 36, letterSpacing: 6, color: TEXT2, opacity: fieldText}}>•••• •••• •••• ••••</div>
            <div style={{opacity: restFade}}>
              <div style={{position: 'absolute', left: 70, right: 70, top: 196, fontSize: 56, fontWeight: 700, lineHeight: 1.1, whiteSpace: 'nowrap', clipPath: `inset(0 ${(1 - head) * 100}% 0 0)`}}>
                Stop. Is this really your bank?
              </div>
              <div style={{position: 'absolute', left: 70, top: 286, fontSize: 32, color: TEXT2, opacity: sub}}>Real banks never ask for this here.</div>
              <div
                style={{
                  position: 'absolute',
                  left: 70,
                  top: 370,
                  padding: '26px 56px',
                  borderRadius: 999,
                  background: DEEP,
                  color: '#fff',
                  fontSize: 36,
                  fontWeight: 700,
                  transform: `scale(${btn})`,
                  transformOrigin: 'left center',
                }}
              >
                Stop and stay safe
              </div>
            </div>
            <div style={{position: 'absolute', left: 290, top: 538, fontSize: 30, color: TEXT2, whiteSpace: 'nowrap', clipPath: `inset(0 ${(1 - route) * 100}% 0 0)`}}>
              <b style={{color: INK}}>Checked on your device</b> · nothing left your computer
            </div>
          </div>
          {/* the shield: drawn in the band, then shrinks into the green "private" dot */}
          {f >= 92 && (
            <div style={{position: 'absolute', left: shieldX - shieldSize / 2, top: shieldY - shieldSize / 2, width: shieldSize, height: shieldSize}}>
              {s2d < 0.98 ? (
                <Shield size={shieldSize} draw={shieldDraw} fill={shieldFill} color={s2d > 0.5 ? OK : '#fff'} />
              ) : (
                <div style={{width: shieldSize, height: shieldSize, borderRadius: '50%', background: OK}} />
              )}
            </div>
          )}
        </AbsoluteFill>
      )}

      {/* the cursor and its click */}
      {f < 70 && (
        <>
          {click && (
            <div style={{position: 'absolute', left: 760 - 60 * ripple, top: 560 - 60 * ripple, width: 120 * ripple, height: 120 * ripple, borderRadius: '50%', border: `3px solid ${DEEP}`, opacity: 1 - ripple}} />
          )}
          <Cursor x={lerp(1500, 760, cur)} y={lerp(920, 560, cur)} o={1 - r(f, 58, 68)} />
        </>
      )}

      {/* the phone: the green dot grows into the caller */}
      {showPhone && (
        <AbsoluteFill style={{opacity: endPhone}}>
          <div
            style={{
              position: 'absolute',
              left: phoneX - 230,
              top: 150,
              width: 460,
              height: 840,
              borderRadius: 64,
              border: `6px solid ${INK}`,
              background: SURFACE,
              opacity: phone * phoneO,
              transform: `scale(${lerp(0.9, 1, phone)})`,
              clipPath: `inset(0 0 ${(1 - phone) * 100}% 0 round 64px)`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: phoneX - avatarR,
              top: 470 - avatarR - lerp(0, 150, phone),
              width: avatarR * 2,
              height: avatarR * 2,
              borderRadius: '50%',
              background: avatarColor < 1 ? `color-mix(in srgb, ${DEEP} ${avatarColor * 100}%, ${OK})` : DEEP,
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              fontSize: 64,
              fontWeight: 700,
              opacity: phoneO,
            }}
          >
            <span style={{opacity: callText}}>B</span>
          </div>
          <div style={{position: 'absolute', left: phoneX - 230, width: 460, top: 470, textAlign: 'center', opacity: callText * phoneO}}>
            <div style={{fontSize: 40, fontWeight: 700}}>“My bank”</div>
            <div style={{fontSize: 26, color: TEXT2, marginTop: 6}}>On the phone · 02:14</div>
          </div>
          {[
            {t: 'Read them a code', s: chip1, y: 610, on: tap},
            {t: 'Buy gift cards', s: chip2, y: 690, on: 0},
          ].map((c) => (
            <div
              key={c.t}
              style={{
                position: 'absolute',
                left: phoneX - 170,
                top: c.y,
                width: 340,
                padding: '18px 0',
                textAlign: 'center',
                borderRadius: 999,
                border: `3px solid ${c.on > 0.5 ? DEEP : LINE}`,
                background: c.on > 0.5 ? '#E3ECF2' : SURFACE,
                fontSize: 28,
                fontWeight: 700,
                transform: `scale(${c.s * (1 - 0.06 * Math.sin(Math.PI * c.on))})`,
                opacity: phoneO,
              }}
            >
              {c.t}
            </div>
          ))}
        </AbsoluteFill>
      )}

      {/* the "Hang up now" pill, which becomes the family alert, then the line under the wordmark */}
      {pillStage && (
        <div
          style={{
            position: 'absolute',
            left: (f < 354 ? pill.cx : line.cx) - (f < 354 ? pill.w : line.w) / 2,
            top: (f < 354 ? pill.cy : line.cy) - (f < 354 ? pill.h : line.h) / 2,
            width: f < 354 ? pill.w : line.w,
            height: f < 354 ? pill.h : line.h,
            borderRadius: f < 354 ? pill.rad : line.rad,
            background: f < 354 ? (fly > 0.5 ? SURFACE : SIGNAL) : lerp(0, 1, fold) > 0.5 ? DEEP : SURFACE,
            boxShadow: fly > 0.5 && f < 360 ? '0 24px 60px rgba(14,34,51,0.16)' : 'none',
            overflow: 'hidden',
            transform: `scale(${f < 300 ? pillUp : 1})`,
          }}
        >
          {/* the amber pill stays on as the alert's accent bar */}
          <div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: lerp(f < 354 ? pill.w : line.w, 12, fly), background: SIGNAL, opacity: 1 - fold}} />
          <div style={{position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 36, fontWeight: 700, color: INK, opacity: 1 - r(f, 300, 306)}}>Hang up now.</div>
          <div style={{position: 'absolute', left: 48, top: 40, right: 30, opacity: alertText * (1 - fold)}}>
            <div style={{fontSize: 22, color: TEXT2, letterSpacing: 1}}>TRIPWIRE GUARDIAN · JUST NOW</div>
            <div style={{fontSize: 38, fontWeight: 700, marginTop: 12}}>Mum hung up on a likely scam</div>
            <div style={{fontSize: 26, color: TEXT2, marginTop: 10}}>A fake bank call asked for a code.</div>
          </div>
        </div>
      )}

      {/* the end: the line becomes the underline of the wordmark */}
      {f >= 368 && (
        <>
          <div style={{position: 'absolute', left: 0, right: 0, top: 470, textAlign: 'center', fontSize: 150, fontWeight: 700, letterSpacing: -3, color: INK, clipPath: `inset(0 ${(1 - word) * 100}% 0 0)`}}>
            Tripwire
          </div>
          <div style={{position: 'absolute', left: 0, right: 0, top: 690, textAlign: 'center', fontSize: 40, color: INK, opacity: tag, transform: `translateY(${(1 - tag) * 12}px)`}}>
            Steps in at the moment of a scam.
          </div>
          <div style={{position: 'absolute', left: 0, right: 0, top: 760, textAlign: 'center', fontSize: 26, color: TEXT2, opacity: tag2}}>
            <span style={{display: 'inline-block', width: 12, height: 12, borderRadius: 6, background: OK, marginRight: 12}} />
            Gemini Nano on your device first · Firebase AI Logic
          </div>
        </>
      )}
      {/* captions sit above everything */}
      <Caption text="Scams take the money when you act." from={4} to={70} />
      <Caption text="Tripwire steps in first." from={98} to={178} />
      <Caption text="Checked on your device. Nothing sent." from={182} to={226} />
      <Caption text="On a call? Tap what they want." from={232} to={290} />
      <Caption text="Your family hears in seconds." from={304} to={352} />
    </AbsoluteFill>
  );
};
