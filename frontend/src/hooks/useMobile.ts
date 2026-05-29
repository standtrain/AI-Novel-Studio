import { Grid } from 'antd';

const { useBreakpoint } = Grid;

/**
 * 响应式检测 Hook，屏幕宽度 < 768px 判定为移动端
 */
export default function useMobile(): boolean {
  const screens = useBreakpoint();
  // xs 断点为 < 576px，sm 断点为 >= 576px，md 断点为 >= 768px
  // 当 md 为 false 时，屏幕宽度 < 768px，视为移动端
  return !screens.md;
}
