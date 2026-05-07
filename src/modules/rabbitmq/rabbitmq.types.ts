export type SocketEmission = {
  event: string;
  payload: Record<string, unknown>;
};

export type DomainProcessResult = {
  socketEvents: SocketEmission[];
  mapUpdate: Record<string, unknown> | null;
};
