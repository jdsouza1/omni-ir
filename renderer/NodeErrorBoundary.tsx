import { Component, type ErrorInfo, type ReactNode } from "react";
import type { OmniContextValue } from "./context";
import { NodeFallback } from "./NodeFallback";

interface Props {
  id: string;
  /** When any of these change (node object or the state values it reads), a crashed node retries. */
  resetKeys: readonly unknown[];
  report: OmniContextValue["report"];
  children: ReactNode;
}

interface State {
  error: unknown;
  resetKeys: readonly unknown[];
}

const NO_ERROR = Symbol("no error");

/**
 * R7: contains a crash to the one node that threw. React 19 still requires a class component
 * for error boundaries.
 */
export class NodeErrorBoundary extends Component<Props, State> {
  override state: State = { error: NO_ERROR, resetKeys: this.props.resetKeys };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    const changed =
      props.resetKeys.length !== state.resetKeys.length ||
      props.resetKeys.some((key, i) => !Object.is(key, state.resetKeys[i]));
    return changed ? { error: NO_ERROR, resetKeys: props.resetKeys } : null;
  }

  override componentDidCatch(error: unknown, _info: ErrorInfo): void {
    this.props.report({
      type: "error",
      issue: {
        code: "node_crashed",
        message: error instanceof Error ? error.message : String(error),
        id: this.props.id,
      },
    });
  }

  override render(): ReactNode {
    if (this.state.error !== NO_ERROR) return <NodeFallback id={this.props.id} reason="crashed" />;
    return this.props.children;
  }
}
