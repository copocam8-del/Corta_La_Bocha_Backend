import { Injectable } from '@nestjs/common';
import { ContenidoVistoService } from '../games/contenido-visto.service';
import { elegirPalabras, nombreCategoria, type TematicaImpostor } from './impostor-rules';

// El Impostor "En persona" (un solo celular que se pasan): el juego entero corre en el navegador.
// El servidor sólo elige las palabras (las que ese usuario no vio, del mismo banco que el online) y
// las marca como vistas. No guarda partida ni cuenta para estadísticas, ELO, ligas ni logros.
@Injectable()
export class ImpostorService {
  constructor(private readonly vistos: ContenidoVistoService) {}

  async palabrasLocal(userId: string, tematica: TematicaImpostor, rondas: number, azar = Math.random) {
    const vistos = await this.vistos.leer([userId], 'impostor');
    const elegidas = elegirPalabras(tematica, rondas, vistos, azar);
    await this.vistos.marcar([userId], 'impostor', elegidas.map((w) => w.texto));
    return { palabras: elegidas.map((w) => ({ texto: w.texto, categoria: nombreCategoria(w.categoria) })) };
  }
}
