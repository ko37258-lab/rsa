// 아티팩트 빌드 전용: cdnjs의 React UMD에는 react/jsx-runtime이 없어서
// JSX 호출을 React.createElement로 이어 줍니다. (props.children은 그대로 전달됩니다.)
import React from "react";

type Props = Record<string, unknown> | null;

export const Fragment = React.Fragment;

export function jsx(type: React.ElementType, props: Props, key?: React.Key) {
  return React.createElement(type, key === undefined ? props : { ...props, key });
}

export const jsxs = jsx;
