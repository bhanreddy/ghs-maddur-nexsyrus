/**
 * SchoolBackground.tsx
 * ─────────────────────────────────────────────
 * Tiling stationery-pattern background for SchoolIMS.
 * Drop this once in your root layout — every screen inherits it.
 *
 * Requirements: react-native-svg (Expo built-in), react-native-reanimated
 * Usage: <SchoolBackground /> inside a flex:1 View in _layout.tsx / App.tsx
 */

import React, { useEffect, memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Defs,
  Pattern,
  Rect,
  G,
  Line,
  Circle,
  Path,
  Polygon,
  Ellipse,
} from 'react-native-svg';
import Animated, {
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  useAnimatedProps,
  Easing,
} from 'react-native-reanimated';
import { schoolTheme } from '@/src/constants/schoolConfig';
import { useTheme } from '@/src/hooks/useTheme';

// ─── Animated SVG <G> ────────────────────────────────────────────────────────
const AnimatedG = Animated.createAnimatedComponent(G);

// ─── Component ───────────────────────────────────────────────────────────────
function SchoolBackgroundComponent() {
  // Follow the APP's light/dark toggle (not the OS scheme) so the chat backdrop
  // always matches the rest of the UI. schoolTheme still drives the colours so
  // the pattern stays on-brand.
  const { isDark } = useTheme();
  const themed = schoolTheme[isDark ? 'dark' : 'light'].colors;
  const cream = themed.background;   // base tint
  const gold = themed.primary;       // school brand colour drives the icon strokes

  // Shared values for 3 pulse phases (matches CSS pa/pb/pc with 1.4s offsets)
  const opA = useSharedValue(0.26);
  const opB = useSharedValue(0.26);
  const opC = useSharedValue(0.26);

  useEffect(() => {
    const pulse = (sv: typeof opA, delayMs: number) => {
      sv.value = withDelay(
        delayMs,
        withRepeat(
          withSequence(
            withTiming(0.44, { duration: 2100, easing: Easing.inOut(Easing.ease) }),
            withTiming(0.26, { duration: 2100, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          false
        )
      );
    };
    pulse(opA, 0);
    pulse(opB, 1400);
    pulse(opC, 2800);
  }, []);

  const animPropsA = useAnimatedProps(() => ({ opacity: opA.value }));
  const animPropsB = useAnimatedProps(() => ({ opacity: opB.value }));
  const animPropsC = useAnimatedProps(() => ({ opacity: opC.value }));

  // Shared stroke style applied to every icon group
  const S = {
    stroke: gold,
    fill: 'none',
    strokeWidth: 1.3,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.root]}
      pointerEvents="none"
      // GPU composite — prevents re-rasterising on every parent render
      shouldRasterizeIOS
      renderToHardwareTextureAndroid
    >
      <Svg width="100%" height="100%" preserveAspectRatio="xMinYMin slice">
        <Defs>
          {/*
           * 480×480 logical tile, rendered at scale(0.34) → ~163 px effective tile.
           * Bump scale toward 0.40 on small screens if icons look cramped.
           */}
          <Pattern
            id="schoolbg-pattern"
            x="0"
            y="0"
            width="480"
            height="480"
            patternUnits="userSpaceOnUse"
            patternTransform="scale(0.55)"
          >
            {/* ── Base fill ─────────────────────────────────────────────── */}
            <Rect width="480" height="480" fill={cream} />

            {/* ══════════════════════════════════════════════════════════════
                STATIC ICONS  (opacity fixed at 0.44)
                ROW A: Ruler, Globe, Pencil
                ROW B: Magnifying Glass, Apple, Star
                ROW C: Bar Chart, Drawing Compass, Pencil Sharpener
                ROW D: Student, Angled Ruler, Protractor
                ROW E: Pencil Case, Set Square, Crayon
                ROW F: Crosshair Magnifier, Apple-with-divide, Closed Compass,
                       Compact Calculator, Open Book, Scissors variant
                DECORATIVES: circles, diamonds, plus-marks, arcs, sparkles, fillers
                ══════════════════════════════════════════════════════════════ */}
            <G {...S} opacity={0.32}>

              {/* ── ROW A  y=44 ──────────────────────────────────────────── */}

              {/* Ruler */}
              <G transform="translate(117,44)">
                <Rect x="-18" y="-5" width="36" height="10" rx="1.5" />
                <Line x1="-14" y1="-5" x2="-14" y2="0" />
                <Line x1="-10" y1="-5" x2="-10" y2="-2" />
                <Line x1="-6"  y1="-5" x2="-6"  y2="0" />
                <Line x1="-2"  y1="-5" x2="-2"  y2="-2" />
                <Line x1="2"   y1="-5" x2="2"   y2="0" />
                <Line x1="6"   y1="-5" x2="6"   y2="-2" />
                <Line x1="10"  y1="-5" x2="10"  y2="0" />
                <Line x1="14"  y1="-5" x2="14"  y2="-2" />
                <Circle cx="-16" cy="0" r="1.2" />
              </G>

              {/* Globe with stand */}
              <G transform="translate(263,44)">
                <Circle cx="0" cy="0" r="14" />
                <Ellipse cx="0" cy="0" rx="5.5" ry="14" />
                <Line x1="-14" y1="0"  x2="14" y2="0" />
                <Path d="M -12,-6 Q 0,-8.5 12,-6" />
                <Path d="M -12,6  Q 0,8.5  12,6" />
                <Line x1="0"  y1="14"  x2="0"  y2="19" />
                <Line x1="-6" y1="19"  x2="6"  y2="19" />
              </G>

              {/* Pencil (upright) */}
              <G transform="translate(409,44)">
                <Rect x="-4.5" y="-19" width="9" height="6"  rx="1.5" />
                <Rect x="-4.5" y="-13" width="9" height="3"  />
                <Rect x="-4.5" y="-10" width="9" height="24" rx="0.5" />
                <Polygon points="-4.5,14 4.5,14 0,20" />
                <Circle cx="0" cy="19.5" r="1" />
              </G>

              {/* ── ROW B  y=132 ─────────────────────────────────────────── */}

              {/* Magnifying Glass */}
              <G transform="translate(81,132)">
                <Circle cx="-2" cy="-4" r="12" />
                <Line x1="-2"  y1="-14" x2="-2" y2="4" />
                <Line x1="-12" y1="-4"  x2="8"  y2="-4" />
                <Line x1="7"   y1="5"   x2="16" y2="16" />
              </G>

              {/* Apple with leaf */}
              <G transform="translate(227,132)">
                <Path d="M 0,-12 C -2,-10 -11,-4 -11,4 C -11,10 -7,14 -5,16 L 5,16 C 7,14 11,10 11,4 C 11,-4 2,-10 0,-12 Z" />
                <Line x1="0" y1="-12" x2="0" y2="-18" />
                <Path d="M 0,-16 Q 7,-22 9,-17 Q 4,-14 0,-16" />
              </G>

              {/* 5-pointed Star */}
              <G transform="translate(373,132)">
                <Path d="M 0,-15 L 3.5,-5.5 L 14,-5.5 L 6.5,0.5 L 9,11 L 0,5.5 L -9,11 L -6.5,0.5 L -14,-5.5 L -3.5,-5.5 Z" />
              </G>

              {/* ── ROW C  y=220 ─────────────────────────────────────────── */}

              {/* Bar Chart / Presentation */}
              <G transform="translate(44,220)">
                <Rect x="-16" y="-14" width="32" height="22" rx="2" />
                <Line x1="-11" y1="1" x2="-11" y2="-9" />
                <Line x1="-6"  y1="1" x2="-6"  y2="-5" />
                <Line x1="-1"  y1="1" x2="-1"  y2="-12" />
                <Line x1="4"   y1="1" x2="4"   y2="-4" />
                <Line x1="9"   y1="1" x2="9"   y2="-7" />
                <Line x1="-13" y1="1" x2="11"  y2="1" />
                <Line x1="-16" y1="8" x2="16"  y2="8" />
                <Path d="M -16,8 L -20,14 L 20,14 L 16,8" />
              </G>

              {/* Drawing Compass */}
              <G transform="translate(190,220)">
                <Circle cx="0" cy="-8" r="3" />
                <Line x1="-1.5" y1="-5" x2="-9" y2="17" />
                <Line x1="1.5"  y1="-5" x2="9"  y2="17" />
                <Line x1="-5"   y1="3"  x2="5"  y2="3" />
                <Circle cx="-9" cy="17" r="1.8" />
                <Rect x="6.5" y="13" width="5" height="8" rx="1" />
                <Polygon points="9,21 6.5,14 11.5,14" />
              </G>

              {/* Pencil Sharpener */}
              <G transform="translate(336,220)">
                <Rect x="-12" y="-9" width="24" height="18" rx="2" />
                <Circle cx="5" cy="0" r="5.5" />
                <Line x1="-10" y1="5" x2="-2" y2="-3" />
                <Circle cx="-6" cy="-4" r="1.5" />
                <Line x1="-7.5" y1="-4" x2="-4.5" y2="-4" />
              </G>

              {/* ── ROW D  y=308 ─────────────────────────────────────────── */}

              {/* Student / Person */}
              <G transform="translate(81,308)">
                <Circle cx="0" cy="-8" r="7" />
                <Path d="M -14,19 C -14,7 -7,1 0,1 C 7,1 14,7 14,19" />
              </G>

              {/* Ruler (angled) */}
              <G transform="translate(227,308) rotate(-20)">
                <Rect x="-18" y="-5" width="36" height="10" rx="1.5" />
                <Line x1="-14" y1="-5" x2="-14" y2="0" />
                <Line x1="-10" y1="-5" x2="-10" y2="-2" />
                <Line x1="-6"  y1="-5" x2="-6"  y2="0" />
                <Line x1="-2"  y1="-5" x2="-2"  y2="-2" />
                <Line x1="2"   y1="-5" x2="2"   y2="0" />
                <Line x1="6"   y1="-5" x2="6"   y2="-2" />
                <Line x1="10"  y1="-5" x2="10"  y2="0" />
                <Line x1="14"  y1="-5" x2="14"  y2="-2" />
              </G>

              {/* Protractor (semicircle) */}
              <G transform="translate(373,308)">
                <Path d="M -16,4 A 16,16,0,0,1,16,4" />
                <Line x1="-16"  y1="4"    x2="16"   y2="4" />
                <Circle cx="0" cy="4" r="1.8" />
                <Line x1="0"    y1="-12"  x2="0"    y2="-8" />
                <Line x1="-11.3" y1="-11.3" x2="-9" y2="-9" />
                <Line x1="11.3"  y1="-11.3" x2="9"  y2="-9" />
                <Line x1="-16"  y1="4"    x2="-12"  y2="4" />
                <Line x1="16"   y1="4"    x2="12"   y2="4" />
                <Line x1="-8"   y1="-14"  x2="-6.5" y2="-11" />
                <Line x1="8"    y1="-14"  x2="6.5"  y2="-11" />
              </G>

              {/* ── ROW E  y=396 ─────────────────────────────────────────── */}

              {/* Pencil Case / Pouch */}
              <G transform="translate(44,396)">
                <Rect x="-15" y="-9" width="30" height="20" rx="6" />
                <Path d="M -13,-9 Q 0,-13 13,-9" />
                <Line x1="0" y1="-13" x2="0" y2="-17" />
                <Rect x="-2.5" y="-19" width="5" height="3" rx="0.8" />
                <Line x1="-6" y1="-9" x2="-6" y2="-18" />
                <Line x1="5"  y1="-9" x2="5"  y2="-17" />
                <Polygon points="-7.5,-18 -4.5,-18 -6,-21" />
                <Polygon points="3.5,-17 6.5,-17 5,-20" />
              </G>

              {/* Set Square / Triangle */}
              <G transform="translate(190,396)">
                <Polygon points="0,-17 -16,14 16,14" />
                <Line x1="-4"  y1="14" x2="0" y2="6" />
                <Line x1="-8"  y1="14" x2="0" y2="-2" />
                <Line x1="-12" y1="14" x2="0" y2="-10" />
                <Path d="M -13,14 L -13,9 L -8,9" />
              </G>

              {/* Crayon */}
              <G transform="translate(336,396)">
                <Rect x="-5" y="-18" width="10" height="4"  rx="1" />
                <Rect x="-5" y="-14" width="10" height="26" rx="1" />
                <Rect x="-5" y="-8"  width="10" height="12" />
                <Line x1="-5" y1="-8" x2="5" y2="-8" />
                <Line x1="-5" y1="4"  x2="5" y2="4" />
                <Polygon points="-5,12 5,12 3,18 -3,18" />
                <Polygon points="-3,18 3,18 0,22" />
              </G>

              {/* ── ROW F  y=452  (partial repeat row) ───────────────────── */}

              {/* Crosshair Magnifier */}
              <G transform="translate(81,452)">
                <Circle cx="-3" cy="-4" r="11" />
                <Line x1="5"   y1="4"   x2="14" y2="14" />
                <Line x1="-3"  y1="-13" x2="-3" y2="5" />
                <Line x1="-12" y1="-4"  x2="6"  y2="-4" />
              </G>

              {/* Apple (divided) */}
              <G transform="translate(154,452)">
                <Path d="M 0,-12 C -2,-10 -11,-4 -11,4 C -11,10 -7,14 -5,16 L 5,16 C 7,14 11,10 11,4 C 11,-4 2,-10 0,-12 Z" />
                <Line x1="0" y1="-12" x2="0" y2="-17" />
                <Path d="M 0,-16 Q 7,-22 9,-17 Q 4,-13 0,-16" />
                <Line x1="0" y1="-2"  x2="0" y2="12" />
              </G>

              {/* Compass (closed variant) */}
              <G transform="translate(227,452)">
                <Circle cx="0" cy="-9" r="3" />
                <Line x1="-1.5" y1="-6" x2="-9" y2="16" />
                <Line x1="1.5"  y1="-6" x2="9"  y2="16" />
                <Line x1="-5"   y1="2"  x2="5"  y2="2" />
                <Circle cx="-9" cy="16" r="2" />
                <Polygon points="7,13 11,13 9,19" />
              </G>

              {/* Calculator (compact) */}
              <G transform="translate(300,452)">
                <Rect x="-12" y="-17" width="24" height="34" rx="3" />
                <Rect x="-9"  y="-14" width="18" height="7"  rx="1.5" />
                <Rect x="-9"  y="-4"  width="5"  height="4"  rx="0.8" />
                <Rect x="-3"  y="-4"  width="5"  height="4"  rx="0.8" />
                <Rect x="3"   y="-4"  width="5"  height="4"  rx="0.8" />
                <Rect x="-9"  y="2"   width="5"  height="4"  rx="0.8" />
                <Rect x="-3"  y="2"   width="5"  height="4"  rx="0.8" />
                <Rect x="3"   y="2"   width="5"  height="4"  rx="0.8" />
              </G>

              {/* Open Book variant */}
              <G transform="translate(373,452)">
                <Path d="M 0,13 L 0,-13 Q -7,-15 -16,-11 L -16,13 Q -7,9 0,13" />
                <Path d="M 0,13 L 0,-13 Q 7,-15 16,-11 L 16,13 Q 7,9 0,13" />
                <Line x1="-12" y1="-5" x2="-3" y2="-5" />
                <Line x1="-12" y1="0"  x2="-3" y2="0" />
                <Line x1="-12" y1="5"  x2="-3" y2="5" />
                <Line x1="3"   y1="-5" x2="12" y2="-5" />
                <Line x1="3"   y1="0"  x2="12" y2="0" />
                <Line x1="3"   y1="5"  x2="12" y2="5" />
              </G>

              {/* Scissors variant */}
              <G transform="translate(446,452)">
                <Circle cx="-6" cy="7" r="5.5" />
                <Circle cx="-6" cy="7" r="2.5" />
                <Circle cx="6"  cy="7" r="5.5" />
                <Circle cx="6"  cy="7" r="2.5" />
                <Line x1="-1.5" y1="3" x2="14"  y2="-16" />
                <Line x1="1.5"  y1="3" x2="-14" y2="-16" />
              </G>

              {/* ── DECORATIVE ELEMENTS ──────────────────────────────────── */}

              {/* Medium accent circles */}
              <Circle cx="28"  cy="90"  r="4" />
              <Circle cx="162" cy="176" r="4" />
              <Circle cx="320" cy="174" r="3.5" />
              <Circle cx="458" cy="260" r="4" />
              <Circle cx="30"  cy="262" r="3.5" />
              <Circle cx="200" cy="350" r="4" />
              <Circle cx="420" cy="342" r="3.5" />
              <Circle cx="360" cy="464" r="3.5" />

              {/* Small dot rhythm grid */}
              <Circle cx="75"  cy="68"  r="1.8" />
              <Circle cx="148" cy="80"  r="1.8" />
              <Circle cx="218" cy="75"  r="1.8" />
              <Circle cx="295" cy="82"  r="1.8" />
              <Circle cx="360" cy="74"  r="1.8" />
              <Circle cx="440" cy="88"  r="1.8" />
              <Circle cx="40"  cy="158" r="1.8" />
              <Circle cx="118" cy="166" r="1.8" />
              <Circle cx="200" cy="152" r="1.8" />
              <Circle cx="265" cy="162" r="1.8" />
              <Circle cx="348" cy="155" r="1.8" />
              <Circle cx="418" cy="162" r="1.8" />
              <Circle cx="82"  cy="250" r="1.8" />
              <Circle cx="166" cy="258" r="1.8" />
              <Circle cx="244" cy="250" r="1.8" />
              <Circle cx="322" cy="260" r="1.8" />
              <Circle cx="400" cy="252" r="1.8" />
              <Circle cx="35"  cy="340" r="1.8" />
              <Circle cx="115" cy="345" r="1.8" />
              <Circle cx="198" cy="338" r="1.8" />
              <Circle cx="275" cy="348" r="1.8" />
              <Circle cx="348" cy="338" r="1.8" />
              <Circle cx="424" cy="344" r="1.8" />
              <Circle cx="80"  cy="432" r="1.8" />
              <Circle cx="162" cy="440" r="1.8" />
              <Circle cx="244" cy="432" r="1.8" />
              <Circle cx="312" cy="442" r="1.8" />
              <Circle cx="384" cy="434" r="1.8" />

              {/* Tiny dots */}
              <Circle cx="57"  cy="110" r="1" />
              <Circle cx="133" cy="105" r="1" />
              <Circle cx="252" cy="108" r="1" />
              <Circle cx="314" cy="115" r="1" />
              <Circle cx="394" cy="108" r="1" />
              <Circle cx="22"  cy="195" r="1" />
              <Circle cx="97"  cy="202" r="1" />
              <Circle cx="234" cy="204" r="1" />
              <Circle cx="306" cy="196" r="1" />
              <Circle cx="378" cy="203" r="1" />
              <Circle cx="57"  cy="282" r="1" />
              <Circle cx="208" cy="284" r="1" />
              <Circle cx="280" cy="292" r="1" />
              <Circle cx="430" cy="291" r="1" />
              <Circle cx="97"  cy="380" r="1" />
              <Circle cx="244" cy="382" r="1" />
              <Circle cx="392" cy="382" r="1" />

              {/* Diamond shapes (rotated rects) */}
              <Rect x="-3.5" y="-3.5" width="7" height="7" rx="0.5" transform="translate(68,178)  rotate(45)" />
              <Rect x="-3"   y="-3"   width="6" height="6" rx="0.5" transform="translate(142,264) rotate(45)" />
              <Rect x="-3.5" y="-3.5" width="7" height="7" rx="0.5" transform="translate(214,340) rotate(45)" />
              <Rect x="-3"   y="-3"   width="6" height="6" rx="0.5" transform="translate(290,88)  rotate(45)" />
              <Rect x="-3.5" y="-3.5" width="7" height="7" rx="0.5" transform="translate(366,432) rotate(45)" />
              <Rect x="-3"   y="-3"   width="6" height="6" rx="0.5" transform="translate(446,178) rotate(45)" />
              <Rect x="-3"   y="-3"   width="6" height="6" rx="0.5" transform="translate(22,432)  rotate(45)" />
              <Rect x="-3.5" y="-3.5" width="7" height="7" rx="0.5" transform="translate(462,92)  rotate(45)" />

              {/* Plus / cross marks */}
              <Line x1="156" y1="20"  x2="156" y2="28" /><Line x1="152" y1="24"  x2="160" y2="24" />
              <Line x1="232" y1="158" x2="232" y2="166"/><Line x1="228" y1="162" x2="236" y2="162"/>
              <Line x1="352" y1="258" x2="352" y2="266"/><Line x1="348" y1="262" x2="356" y2="262"/>
              <Line x1="442" y1="350" x2="442" y2="358"/><Line x1="438" y1="354" x2="446" y2="354"/>
              <Line x1="124" y1="20"  x2="124" y2="28" /><Line x1="120" y1="24"  x2="128" y2="24" />
              <Line x1="22"  y1="110" x2="22"  y2="118"/><Line x1="18"  y1="114" x2="26"  y2="114"/>

              {/* Mini arcs (sparkle-like) */}
              <Path d="M 148,170 Q 155,163 162,170" />
              <Path d="M 316,168 Q 323,161 330,168" />
              <Path d="M 58,352  Q 65,345  72,352" />
              <Path d="M 420,88  Q 427,81  434,88" />

              {/* Small triangles */}
              <Polygon points="60,24 66,20 66,28" />
              <Polygon points="386,26 392,22 392,30" />
              <Polygon points="466,136 472,132 472,140" />

              {/* Double-ring accent dots */}
              <Circle cx="240" cy="24"  r="5" />
              <Circle cx="240" cy="24"  r="2.5" />
              <Circle cx="466" cy="308" r="5" />
              <Circle cx="466" cy="308" r="2.5" />
              <Circle cx="24"  cy="396" r="4.5" />
              <Circle cx="24"  cy="396" r="2" />

              {/* Stacked arc sparkles */}
              <Path d="M -6,6 Q 0,-2 6,6" transform="translate(350,20)" />
              <Path d="M -9,8 Q 0,-4 9,8" transform="translate(350,20)" />
              <Path d="M -6,6 Q 0,-2 6,6" transform="translate(22,48)" />
              <Path d="M -9,8 Q 0,-4 9,8" transform="translate(22,48)" />
              <Path d="M -6,6 Q 0,-2 6,6" transform="translate(464,396)" />
              <Path d="M -9,8 Q 0,-4 9,8" transform="translate(464,396)" />

              {/* Mini pencil fillers */}
              <G transform="translate(470,178) rotate(30)" opacity={0.6}>
                <Rect x="-2" y="-9" width="4" height="14" rx="0.5" />
                <Polygon points="-2,5 2,5 0,9" />
                <Rect x="-2" y="-11" width="4" height="3" rx="0.5" />
              </G>
              <G transform="translate(24,262) rotate(-20)" opacity={0.6}>
                <Rect x="-2" y="-9" width="4" height="14" rx="0.5" />
                <Polygon points="-2,5 2,5 0,9" />
                <Rect x="-2" y="-11" width="4" height="3" rx="0.5" />
              </G>
              <G transform="translate(462,432) rotate(15)" opacity={0.6}>
                <Rect x="-2" y="-9" width="4" height="14" rx="0.5" />
                <Polygon points="-2,5 2,5 0,9" />
                <Rect x="-2" y="-11" width="4" height="3" rx="0.5" />
              </G>

              {/* Mini book fillers */}
              <G transform="translate(26,176) rotate(5)" opacity={0.5}>
                <Rect x="-5" y="-7" width="10" height="14" rx="1" />
                <Line x1="-3" y1="-7" x2="-3" y2="7" />
                <Line x1="-1" y1="-4" x2="4"  y2="-4" />
                <Line x1="-1" y1="-1" x2="4"  y2="-1" />
                <Line x1="-1" y1="2"  x2="4"  y2="2" />
              </G>
              <G transform="translate(468,264) rotate(-8)" opacity={0.5}>
                <Rect x="-5" y="-7" width="10" height="14" rx="1" />
                <Line x1="-3" y1="-7" x2="-3" y2="7" />
                <Line x1="-1" y1="-4" x2="4"  y2="-4" />
                <Line x1="-1" y1="-1" x2="4"  y2="-1" />
                <Line x1="-1" y1="2"  x2="4"  y2="2" />
              </G>

            </G>
            {/* END STATIC ─────────────────────────────────────────────────── */}


            {/* ══════════════════════════════════════════════════════════════
                PULSE GROUP A  — phase 0s  (Book · Backpack · Scissors · Pen · Microscope)
                opacity animates 0.38 → 0.60 → 0.38 @ 4.2s cycle
                ══════════════════════════════════════════════════════════════ */}
            <AnimatedG animatedProps={animPropsA} {...S}>

              {/* Closed Book with bookmark */}
              <G transform="translate(44,44)">
                <Rect x="-14" y="-17" width="28" height="34" rx="2" />
                <Line x1="-9" y1="-17" x2="-9" y2="17" />
                <Line x1="-4" y1="-10" x2="11" y2="-10" />
                <Line x1="-4" y1="-4"  x2="11" y2="-4" />
                <Line x1="-4" y1="2"   x2="11" y2="2" />
                <Line x1="-4" y1="8"   x2="11" y2="8" />
                <Path d="M 8,-17 L 8,-7 L 5.5,-10 L 3,-7 L 3,-17" />
              </G>

              {/* Backpack */}
              <G transform="translate(154,132)">
                <Rect x="-12" y="-8" width="24" height="24" rx="4" />
                <Path d="M -5,-8 Q -5,-15 0,-15 Q 5,-15 5,-8" />
                <Rect x="-9" y="4" width="18" height="9" rx="2" />
                <Line x1="-7" y1="8.5" x2="7" y2="8.5" />
                <Circle cx="0" cy="8.5" r="1.5" />
                <Line x1="-12" y1="-2" x2="-14" y2="12" />
                <Line x1="12"  y1="-2" x2="14"  y2="12" />
              </G>

              {/* Scissors */}
              <G transform="translate(117,220)">
                <Circle cx="-6" cy="8" r="6" />
                <Circle cx="-6" cy="8" r="2.5" />
                <Circle cx="6"  cy="8" r="6" />
                <Circle cx="6"  cy="8" r="2.5" />
                <Line x1="-1.5" y1="3" x2="14"  y2="-17" />
                <Line x1="1.5"  y1="3" x2="-14" y2="-17" />
              </G>

              {/* Fountain Pen */}
              <G transform="translate(154,308)">
                <Rect x="-3.5" y="-19" width="7" height="9"  rx="1.5" />
                <Line x1="2.5" y1="-18" x2="2.5" y2="-12" />
                <Line x1="2.5" y1="-12" x2="4.5" y2="-10" />
                <Rect x="-3.5" y="-10" width="7" height="20" rx="2" />
                <Path d="M -3.5,10 L -2,14 L 2,14 L 3.5,10" />
                <Polygon points="-2,14 2,14 0,19" />
                <Line x1="0" y1="14" x2="0" y2="18" />
              </G>

              {/* Microscope */}
              <G transform="translate(117,396)">
                <Rect x="-10" y="12"  width="20" height="5"  rx="1.5" />
                <Line x1="0"  y1="12" x2="0"  y2="-4" />
                <Rect x="-8"  y="5"   width="16" height="3"  rx="0.5" />
                <Rect x="-2.5" y="-4" width="5"  height="4"  rx="0.5" />
                <Rect x="-3.5" y="-14" width="7" height="12" rx="2" />
                <Line x1="0"  y1="-14" x2="-7" y2="-19" />
                <Rect x="-10" y="-23" width="6" height="5"   rx="1.5" />
              </G>

            </AnimatedG>


            {/* ══════════════════════════════════════════════════════════════
                PULSE GROUP B  — phase 1.4s  (Calculator · Open Book · Eraser · Test · Pushpin)
                ══════════════════════════════════════════════════════════════ */}
            <AnimatedG animatedProps={animPropsB} {...S}>

              {/* Calculator */}
              <G transform="translate(190,44)">
                <Rect x="-12" y="-17" width="24" height="34" rx="3" />
                <Rect x="-9"  y="-14" width="18" height="7"  rx="1.5" />
                <Rect x="-9"  y="-4"  width="5"  height="4"  rx="0.8" />
                <Rect x="-3"  y="-4"  width="5"  height="4"  rx="0.8" />
                <Rect x="3"   y="-4"  width="5"  height="4"  rx="0.8" />
                <Rect x="-9"  y="2"   width="5"  height="4"  rx="0.8" />
                <Rect x="-3"  y="2"   width="5"  height="4"  rx="0.8" />
                <Rect x="3"   y="2"   width="5"  height="4"  rx="0.8" />
                <Rect x="-9"  y="8"   width="5"  height="4"  rx="0.8" />
                <Rect x="-3"  y="8"   width="5"  height="4"  rx="0.8" />
                <Rect x="3"   y="8"   width="5"  height="4"  rx="0.8" />
              </G>

              {/* Open Book */}
              <G transform="translate(300,132)">
                <Path d="M 0,13 L 0,-13 Q -7,-15 -16,-11 L -16,13 Q -7,9 0,13" />
                <Path d="M 0,13 L 0,-13 Q 7,-15 16,-11 L 16,13 Q 7,9 0,13" />
                <Rect x="-1.5" y="-13" width="3" height="26" />
                <Line x1="-12" y1="-5" x2="-3" y2="-5" />
                <Line x1="-12" y1="0"  x2="-3" y2="0" />
                <Line x1="-12" y1="5"  x2="-3" y2="5" />
                <Line x1="3"   y1="-5" x2="12" y2="-5" />
                <Line x1="3"   y1="0"  x2="12" y2="0" />
                <Line x1="3"   y1="5"  x2="12" y2="5" />
              </G>

              {/* Eraser */}
              <G transform="translate(263,220)">
                <Rect x="-15" y="-8" width="30" height="16" rx="2" />
                <Line x1="-5"  y1="-8" x2="-5" y2="8" />
                <Line x1="-13" y1="-5" x2="-8" y2="5" />
                <Line x1="-9"  y1="-5" x2="-4" y2="5" />
                <Line x1="0"   y1="-5" x2="12" y2="-5" />
                <Line x1="0"   y1="-1" x2="12" y2="-1" />
                <Line x1="0"   y1="3"  x2="12" y2="3" />
              </G>

              {/* Test / Answer Sheet */}
              <G transform="translate(300,308)">
                <Rect x="-12" y="-17" width="24" height="34" rx="1.5" />
                <Path d="M 6,-17 L 12,-11 L 6,-11 Z" />
                <Line x1="-8" y1="-8" x2="4"  y2="-8" />
                <Line x1="-8" y1="-3" x2="10" y2="-3" />
                <Line x1="-8" y1="2"  x2="10" y2="2" />
                <Line x1="-8" y1="7"  x2="10" y2="7" />
                <Path d="M -3,13 L 0,16 L 6,10" />
              </G>

              {/* Thumbtack / Pushpin */}
              <G transform="translate(263,396)">
                <Circle cx="0" cy="-8" r="8" />
                <Circle cx="0" cy="-8" r="4" />
                <Path d="M -4,-2 L -2,4 L 2,4 L 4,-2" />
                <Line x1="0" y1="4" x2="0" y2="18" />
                <Circle cx="0" cy="18" r="1" />
              </G>

            </AnimatedG>


            {/* ══════════════════════════════════════════════════════════════
                PULSE GROUP C  — phase 2.8s  (Grad Cap · Notebook · Bell · Trophy · Paperclip)
                ══════════════════════════════════════════════════════════════ */}
            <AnimatedG animatedProps={animPropsC} {...S}>

              {/* Graduation Cap */}
              <G transform="translate(336,44)">
                <Path d="M 0,-16 L 16,-6 L 0,4 L -16,-6 Z" />
                <Path d="M -8,-2 L -8,6 L 8,6 L 8,-2" />
                <Line x1="16" y1="-6" x2="16" y2="4" />
                <Path d="M 14,4 L 16,7 L 18,4" />
                <Rect x="-8" y="6" width="16" height="10" rx="2" />
                <Line x1="-5" y1="10" x2="5" y2="10" />
                <Line x1="-3" y1="13" x2="3" y2="13" />
                <Circle cx="0" cy="18" r="2.5" />
              </G>

              {/* Spiral Notebook */}
              <G transform="translate(446,132)">
                <Rect x="-10" y="-17" width="22" height="34" rx="2" />
                <Path d="M -12,-12 Q -17,-12 -17,-10 Q -17,-8 -12,-8" />
                <Path d="M -12,-3  Q -17,-3  -17,-1  Q -17,1  -12,1" />
                <Path d="M -12,6   Q -17,6   -17,8   Q -17,10 -12,10" />
                <Circle cx="-11" cy="-10" r="1.2" />
                <Circle cx="-11" cy="-1"  r="1.2" />
                <Circle cx="-11" cy="8"   r="1.2" />
                <Line x1="-5" y1="-10" x2="10" y2="-10" />
                <Line x1="-5" y1="-4"  x2="10" y2="-4" />
                <Line x1="-5" y1="2"   x2="10" y2="2" />
                <Line x1="-5" y1="8"   x2="10" y2="8" />
              </G>

              {/* School Bell */}
              <G transform="translate(409,220)">
                <Path d="M 0,-17 Q -14,-14 -14,4 L -14,8 L 14,8 L 14,4 Q 14,-14 0,-17 Z" />
                <Line x1="-16" y1="8"  x2="16" y2="8" />
                <Line x1="0"   y1="8"  x2="0"  y2="14" />
                <Circle cx="0" cy="15.5" r="2.5" />
                <Path d="M -4,-17 Q 0,-21 4,-17" />
                <Line x1="-10" y1="2" x2="10" y2="2" />
              </G>

              {/* Trophy */}
              <G transform="translate(446,308)">
                <Path d="M -8,-14 Q -8,-4 -4,2 L 0,6 L 4,2 Q 8,-4 8,-14 Z" />
                <Path d="M -8,-14 Q -14,-14 -14,-8 Q -14,-2 -8,-2" />
                <Path d="M  8,-14 Q  14,-14  14,-8 Q  14,-2  8,-2" />
                <Rect x="-4" y="6"  width="8"  height="4" rx="0.5" />
                <Rect x="-8" y="10" width="16" height="4" rx="1" />
                <Path d="M 0,-10 L 1.2,-7 L 4.5,-7 L 2,-5 L 3,-2 L 0,-3.5 L -3,-2 L -2,-5 L -4.5,-7 L -1.2,-7 Z" />
              </G>

              {/* Paperclip */}
              <G transform="translate(409,396)">
                <Path d="M 4,-15 Q 10,-15 10,-7 L 10,10 Q 10,18 0,18 Q -10,18 -10,10 L -10,-6 Q -10,-14 2,-14 Q 12,-14 12,-6 L 12,10" />
              </G>

            </AnimatedG>

          </Pattern>
        </Defs>

        {/* Fill entire canvas with the tiling pattern */}
        <Rect width="100%" height="100%" fill="url(#schoolbg-pattern)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    zIndex: -1,
  },
});

export const SchoolBackground = memo(SchoolBackgroundComponent);
