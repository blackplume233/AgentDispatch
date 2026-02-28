export interface DispatchAdvice {
  taskId: string;
  recommendedAgentId: string;
  confidence: number;
  reason?: string;
}

export class ManagerHandler {
  private available = false;
  private agentId: string | null = null;

  setAvailable(agentId: string): void {
    this.agentId = agentId;
    this.available = true;
  }

  setUnavailable(): void {
    this.agentId = null;
    this.available = false;
  }

  isAvailable(): boolean {
    return this.available;
  }

  getAgentId(): string | null {
    return this.agentId;
  }

  async consultForDispatch(_taskSummary: string): Promise<DispatchAdvice | null> {
    if (!this.available) return null;
    // In v1.0, this returns null. When ACP SDK is integrated,
    // this will send a prompt to the Manager Agent and parse the response.
    return null;
  }
}
