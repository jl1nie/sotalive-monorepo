import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ZAxis,
} from 'recharts';

interface ChartDataPoint {
  x: number;
  y: number;
  z: string;
  ref: string;
  code: string;
}

interface ChartDataset {
  label: string;
  data: ChartDataPoint[];
}

interface ScatterChartContentProps {
  datasets: ChartDataset[];
  minTime: number;
  maxTime: number;
  height: number;
  onPointClick: (code: string) => void;
}

// 色のパレット
const colors = [
  '#e57373', '#64b5f6', '#81c784', '#ffb74d', '#ba68c8',
  '#4dd0e1', '#aed581', '#ff8a65', '#90a4ae', '#f06292',
  '#7986cb', '#4db6ac', '#dce775', '#ffab91', '#ce93d8',
];

export function ScatterChartContent({
  datasets,
  minTime,
  maxTime,
  height,
  onPointClick,
}: ScatterChartContentProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 20, right: 30, left: 10, bottom: 60 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          type="number"
          dataKey="x"
          domain={[minTime, maxTime]}
          tickFormatter={(tick) => {
            const d = new Date(tick);
            return `${(d.getUTCMonth() + 1).toString().padStart(2, '0')}/${d.getUTCDate().toString().padStart(2, '0')} ${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')}`;
          }}
          tick={{ fontSize: 10 }}
          angle={-45}
          textAnchor="end"
          height={60}
          tickCount={8}
        />
        <YAxis
          type="number"
          dataKey="y"
          domain={[-0.5, datasets.length - 0.5]}
          hide
        />
        <ZAxis range={[80, 80]} />
        <Tooltip
          content={({ payload }) => {
            if (payload && payload.length > 0) {
              const data = payload[0].payload as ChartDataPoint;
              return (
                <div className="spotchart-tooltip">
                  <div className="spotchart-tooltip-ref">{data.ref}</div>
                  <div className="spotchart-tooltip-detail">{data.z}</div>
                </div>
              );
            }
            return null;
          }}
        />
        <Legend
          layout="horizontal"
          verticalAlign="top"
          wrapperStyle={{ paddingBottom: 10 }}
        />
        {datasets.map((dataset, idx) => (
          <Scatter
            key={dataset.label}
            name={dataset.label}
            data={dataset.data}
            fill={colors[idx % colors.length]}
            onClick={(data) => {
              if (data && data.code) {
                onPointClick(data.code);
              }
            }}
            cursor="pointer"
          />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
}
