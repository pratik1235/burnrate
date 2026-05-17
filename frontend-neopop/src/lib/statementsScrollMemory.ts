let savedScrollY = 0;

export function getStatementsScrollY(): number {
  return savedScrollY;
}

export function setStatementsScrollY(y: number): void {
  savedScrollY = y;
}
