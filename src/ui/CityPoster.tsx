// A small architectural model for the title screen, drawn with the game's own visual language.
export default function CityPoster() {
  const tiles = Array.from({ length: 81 }, (_, i) => ({ x: i % 9, y: Math.floor(i / 9) })).sort(
    (a, b) => a.x + a.y - b.x - b.y,
  );
  return (
    <svg viewBox="-180 -95 370 300" className="h-full w-full" aria-hidden="true">
      {tiles.map(({ x, y }) => {
        const cx = (x - y) * 18,
          cy = (x + y) * 9;
        const road = x % 3 === 0 || y % 3 === 0;
        const h = 12 + ((x * 31 + y * 17) % 5) * 13;
        return (
          <g key={`${x},${y}`}>
            <path d={`M${cx} ${cy - 9}l18 9 -18 9 -18 -9Z`} fill={road ? '#263f4b' : '#49636a'} />
            {!road && (
              <>
                <path d={`M${cx - 14} ${cy}v-${h}l14 7v${h}Z`} fill="#a4b3b4" />
                <path d={`M${cx + 14} ${cy}v-${h}l-14 7v${h}Z`} fill="#648794" />
                <path d={`M${cx} ${cy - h - 7}l14 7 -14 7 -14 -7Z`} fill="#c5d1cb" />
                {Array.from({ length: Math.floor(h / 10) }, (_, n) => (
                  <path
                    key={n}
                    d={`M${cx + 3} ${cy - h + 11 + n * 10}l8 -4`}
                    stroke={(x + y + n) % 3 ? '#efc789' : '#456677'}
                    strokeWidth={3}
                  />
                ))}
              </>
            )}
          </g>
        );
      })}
      <path
        d="M-54 27L0 54 54 27 108 54 0 108 -54 81Z"
        fill="none"
        stroke="#81dac9"
        strokeWidth={2}
        strokeDasharray="5 4"
        className="fiber-flow"
        style={{ animationDuration: '60s' }}
      />
      {[
        [-54, 27],
        [54, 27],
        [108, 54],
        [0, 108],
        [-54, 81],
      ].map(([x, y]) => (
        <g key={`${x},${y}`}>
          <circle cx={x} cy={y} r={8} fill="#163747" stroke="#83d6c5" />
          <circle cx={x} cy={y} r={3} fill="#83d6c5" />
        </g>
      ))}
    </svg>
  );
}
