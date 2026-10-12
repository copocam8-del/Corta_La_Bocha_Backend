import { COUNTDOWN_MS, type GameExtra, type GameMode, type ModeHost, type Result } from './types';

// Base de los juegos nuevos en multijugador (ahorcado, trivia, sopa, memotest): una partida son
// varias rondas iguales. Cada ronda: cuenta regresiva → jugando → resultados → la siguiente.
// El modo concreto decide qué se juega en la ronda, cuándo termina antes de tiempo y los puntos.
export abstract class RoundMode implements GameMode {
  protected roundNumber = 0;
  protected played = 0;
  protected endsAt: number | null = null; // fin de la ronda que ve el jugador (null = sin reloj de ronda)
  protected startedAt = 0;

  constructor(protected readonly host: ModeHost) {}

  // ── Lo que define cada juego ──────────────────────────────────────────────────────────────
  protected abstract prepareRound(): void; // elige la palabra, la pregunta, arma la grilla…
  protected abstract closeRound(): void; // calcula y suma los puntos de la ronda (host.addScore)
  abstract action(userId: string, type: string, payload: unknown): Promise<Result>;
  abstract view(userId: string): object;
  // ¿Ya terminaron todos los que están conectados? (la ronda se corta antes del reloj)
  protected abstract everyoneDone(): boolean;

  protected roundMs(): number | null {
    return this.host.settings.seconds * 1000;
  }
  protected graceMs(): number {
    return 500; // margen para la demora de la red después de que el reloj llega a 0
  }
  protected countdownMs(): number {
    return COUNTDOWN_MS;
  }
  protected resultsMs(): number {
    return 8_000;
  }
  protected onPlaying(): void {}

  // ── Ciclo de la ronda ─────────────────────────────────────────────────────────────────────
  async start() {
    this.nextRound();
  }

  roundsPlayed() {
    return this.played;
  }

  countsForStats() {
    return true;
  }

  extraFor(_userId: string): GameExtra | undefined {
    return undefined;
  }

  protected get total() {
    return this.host.settings.rounds;
  }

  protected nextRound() {
    this.roundNumber += 1;
    this.endsAt = null;
    this.prepareRound();
    const wait = this.countdownMs();
    if (wait <= 0) {
      this.beginPlaying(true);
      return;
    }
    this.host.setPhase('countdown', Date.now() + wait);
    this.host.broadcast();
    this.host.schedule(wait, () => this.beginPlaying(false));
  }

  private beginPlaying(skipCheck: boolean) {
    if (!skipCheck && this.host.getPhase() !== 'countdown') return;
    const ms = this.roundMs();
    this.startedAt = Date.now();
    this.endsAt = ms ? this.startedAt + ms : null;
    this.host.setPhase('playing', null);
    this.onPlaying();
    this.host.broadcast();
    if (ms) this.host.schedule(ms + this.graceMs(), () => this.endRound());
  }

  // Termina la ronda (por tiempo o porque terminaron todos). Una sola vez por ronda.
  protected async endRound() {
    if (this.host.getPhase() !== 'playing') return;
    this.host.cancelTimer();
    this.endsAt = null;
    this.closeRound();
    this.played += 1;
    if (this.roundNumber >= this.total) {
      await this.host.finish();
      return;
    }
    const ms = this.resultsMs();
    this.host.setPhase('results', Date.now() + ms);
    this.host.broadcast();
    this.host.schedule(ms, () => {
      if (this.host.getPhase() === 'results') this.nextRound();
    });
  }

  // Después de cada jugada: si ya terminaron todos los conectados, se corta la ronda
  protected async checkDone() {
    if (this.host.getPhase() === 'playing' && this.everyoneDone()) await this.endRound();
    else this.host.broadcast();
  }

  onPlayerGone(_userId: string): Promise<void> | void {
    if (this.host.getPhase() === 'playing' && this.everyoneDone()) return this.endRound();
  }

  protected connected() {
    return this.host.players().filter((p) => p.connected);
  }

  protected phaseShowsRound() {
    return ['playing', 'results', 'finished'].includes(this.host.getPhase());
  }
}
