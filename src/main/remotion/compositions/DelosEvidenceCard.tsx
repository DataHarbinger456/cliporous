import type { DelosCardKind } from '@shared/types';
import type React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { PrestyjFonts } from '../shared/fonts';

interface Metric {
  label?: string;
  name?: string;
  value: string | number;
}

interface Service {
  name: string;
  status: 'online' | 'warning' | 'offline';
}

interface Waypoint {
  x: number;
  y: number;
  label: string;
}

export interface DelosEvidenceCardProps {
  kind: DelosCardKind;
  accentColor?: string;
  title?: string;
  message?: string;
  severity?: 'critical' | 'warning' | 'info' | 'ok';
  findings?: string[];
  progress?: number;
  statusText?: string;
  metrics?: Metric[];
  hostId?: string;
  services?: Service[];
  label?: string;
  waypoints?: Waypoint[];
  identity?: string;
  pulse?: number;
  stressLevel?: number;
}

const DEFAULT_ACCENT = '#9f75ff';
const PANEL_BG = 'rgba(17, 12, 24, 0.94)';
const TEXT = '#f6ecd9';
const MUTED = 'rgba(246, 236, 217, 0.64)';

const clampPercent = (value: number | undefined): number => Math.max(0, Math.min(100, value ?? 0));

const kindLabel = (kind: DelosCardKind): string =>
  kind
    .replace(/^delos-/, '')
    .replace(/-/g, ' ')
    .toUpperCase();

const MetricTiles: React.FC<{ metrics: Metric[]; accent: string }> = ({ metrics, accent }) => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${Math.max(1, metrics.length)}, 1fr)`,
      gap: 12,
    }}
  >
    {metrics.map((metric) => (
      <div
        key={`${metric.label ?? metric.name}-${metric.value}`}
        style={{
          border: '1px solid rgba(246, 236, 217, 0.14)',
          borderRadius: 12,
          background: 'rgba(255,255,255,0.035)',
          padding: '14px 16px',
        }}
      >
        <div style={{ color: accent, fontSize: 30, fontWeight: 800, lineHeight: 1 }}>
          {metric.value}
        </div>
        <div style={{ color: MUTED, fontSize: 14, marginTop: 8, letterSpacing: '0.08em' }}>
          {(metric.label ?? metric.name ?? 'METRIC').toUpperCase()}
        </div>
      </div>
    ))}
  </div>
);

const CardBody: React.FC<DelosEvidenceCardProps & { accent: string }> = (props) => {
  const { kind, accent } = props;

  if (kind === 'delos-scan-result') {
    const progress = clampPercent(props.progress);
    return (
      <>
        <div style={{ display: 'grid', gap: 10 }}>
          {(props.findings ?? []).map((finding) => (
            <div key={finding} style={{ display: 'flex', gap: 12, fontSize: 22 }}>
              <span style={{ color: accent }}>✓</span>
              <span>{finding}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 22 }}>
          <div
            style={{
              height: 7,
              overflow: 'hidden',
              borderRadius: 99,
              background: 'rgba(255,255,255,0.1)',
            }}
          >
            <div style={{ width: `${progress}%`, height: '100%', background: accent }} />
          </div>
          <div style={{ color: MUTED, fontSize: 14, marginTop: 8 }}>{progress}% ANALYZED</div>
        </div>
      </>
    );
  }

  if (kind === 'delos-alert') {
    const severityColor =
      props.severity === 'critical' ? '#ff5d73' : props.severity === 'warning' ? '#ffb454' : accent;
    return (
      <div style={{ borderLeft: `5px solid ${severityColor}`, paddingLeft: 20 }}>
        <div
          style={{ color: severityColor, fontSize: 15, fontWeight: 800, letterSpacing: '0.12em' }}
        >
          {(props.severity ?? 'info').toUpperCase()}
        </div>
        <div style={{ fontSize: 25, lineHeight: 1.35, marginTop: 10 }}>{props.message}</div>
      </div>
    );
  }

  if (kind === 'delos-console') {
    return <MetricTiles metrics={props.metrics ?? []} accent={accent} />;
  }

  if (kind === 'delos-matrix') {
    return (
      <div style={{ display: 'grid', gap: 13 }}>
        {(props.metrics ?? []).map((metric) => {
          const value = typeof metric.value === 'number' ? clampPercent(metric.value) : 0;
          return (
            <div key={`${metric.name ?? metric.label}-${metric.value}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 17 }}>
                <span style={{ color: MUTED }}>{metric.name ?? metric.label}</span>
                <strong style={{ color: accent }}>{metric.value}</strong>
              </div>
              <div
                style={{
                  height: 5,
                  borderRadius: 99,
                  background: 'rgba(255,255,255,0.1)',
                  marginTop: 7,
                }}
              >
                <div
                  style={{
                    width: `${value}%`,
                    height: '100%',
                    borderRadius: 99,
                    background: accent,
                  }}
                />
              </div>
            </div>
          );
        })}
        {props.hostId ? (
          <div style={{ color: MUTED, fontSize: 13 }}>HOST {props.hostId}</div>
        ) : null}
      </div>
    );
  }

  if (kind === 'delos-system-diagnostics') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {(props.services ?? []).map((service) => {
          const statusColor =
            service.status === 'online'
              ? '#5ee6a8'
              : service.status === 'warning'
                ? '#ffb454'
                : '#ff5d73';
          return (
            <div
              key={service.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10,
                padding: '12px 14px',
              }}
            >
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 99,
                  background: statusColor,
                  boxShadow: `0 0 12px ${statusColor}`,
                }}
              />
              <span style={{ flex: 1 }}>{service.name}</span>
              <span style={{ color: MUTED, fontSize: 12 }}>{service.status.toUpperCase()}</span>
            </div>
          );
        })}
      </div>
    );
  }

  if (kind === 'delos-tracking-map') {
    const points = props.waypoints ?? [];
    return (
      <div
        style={{
          position: 'relative',
          height: 170,
          overflow: 'hidden',
          borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.1)',
          background: 'radial-gradient(circle at center, rgba(159,117,255,0.14), transparent 65%)',
        }}
      >
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0 }}
        >
          <title>Tracking path</title>
          {points.slice(1).map((point, index) => {
            const previous = points[index];
            return previous ? (
              <line
                key={`${previous.label}-${point.label}`}
                x1={previous.x}
                y1={previous.y}
                x2={point.x}
                y2={point.y}
                stroke={accent}
                strokeWidth="0.8"
                strokeDasharray="2 2"
                opacity="0.75"
              />
            ) : null;
          })}
        </svg>
        {points.map((point) => (
          <div
            key={point.label}
            style={{
              position: 'absolute',
              left: `${point.x}%`,
              top: `${point.y}%`,
              transform: 'translate(-50%, -50%)',
              width: 30,
              height: 30,
              borderRadius: 99,
              display: 'grid',
              placeItems: 'center',
              color: '#0d0912',
              background: accent,
              fontWeight: 900,
              boxShadow: `0 0 20px ${accent}`,
            }}
          >
            {point.label}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 12 }}>
      <div
        style={{
          borderRadius: 12,
          padding: 16,
          background: `${accent}18`,
          border: `1px solid ${accent}66`,
        }}
      >
        <div style={{ color: MUTED, fontSize: 13 }}>IDENTITY</div>
        <div style={{ fontSize: 25, fontWeight: 800, marginTop: 8 }}>{props.identity}</div>
      </div>
      <MetricTiles metrics={[{ label: 'Pulse', value: props.pulse ?? 0 }]} accent={accent} />
      <MetricTiles
        metrics={[{ label: 'Stress', value: `${props.stressLevel ?? 0}%` }]}
        accent={accent}
      />
    </div>
  );
};

export const DelosEvidenceCard: React.FC<DelosEvidenceCardProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const accent = props.accentColor ?? DEFAULT_ACCENT;
  const entrance = spring({ frame, fps, config: { damping: 17, stiffness: 125, mass: 0.7 } });
  const exitOpacity = interpolate(
    frame,
    [durationInFrames - Math.round(fps * 0.35), durationInFrames],
    [1, 0],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    },
  );

  return (
    <AbsoluteFill
      style={{
        // Reserve the lower-third for phrase emphasis so both edits can safely
        // coexist without covering one another's vital text.
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        paddingTop: 62,
        paddingLeft: 90,
        paddingRight: 90,
      }}
    >
      <PrestyjFonts />
      <div
        style={{
          width: 720,
          color: TEXT,
          fontFamily: 'Geist',
          borderRadius: 22,
          border: `1px solid ${accent}70`,
          background: PANEL_BG,
          boxShadow: `0 24px 80px rgba(0,0,0,0.52), 0 0 42px ${accent}20`,
          padding: '24px 28px 28px',
          opacity: entrance * exitOpacity,
          transform: `translateY(${interpolate(entrance, [0, 1], [55, 0])}px) scale(${interpolate(entrance, [0, 1], [0.94, 1])})`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 19 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 99,
              background: accent,
              boxShadow: `0 0 16px ${accent}`,
            }}
          />
          <span style={{ color: accent, fontSize: 13, fontWeight: 800, letterSpacing: '0.14em' }}>
            {kindLabel(props.kind)}
          </span>
          {props.statusText ? (
            <span style={{ color: MUTED, fontSize: 12, marginLeft: 'auto' }}>
              {props.statusText}
            </span>
          ) : null}
        </div>
        <div style={{ fontSize: 31, fontWeight: 800, lineHeight: 1.08, marginBottom: 20 }}>
          {props.title ?? props.label ?? props.identity ?? kindLabel(props.kind)}
        </div>
        <CardBody {...props} accent={accent} />
      </div>
    </AbsoluteFill>
  );
};
