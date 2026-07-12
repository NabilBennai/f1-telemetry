// Palette catégorielle validée (jeu de 8 teintes, étape "dark") — voir la
// skill dataviz interne (references/palette.md). L'ordre est figé : il maximise
// la distance perceptuelle minimale entre teintes adjacentes (daltonisme inclus).
export const CATEGORICAL_DARK = [
  "#3987e5", // blue
  "#199e70", // aqua
  "#c98500", // yellow
  "#008300", // green
  "#9085e9", // violet
  "#e66767", // red
  "#d55181", // magenta
  "#d95926", // orange
];

// La couleur d'un tour est dérivée de son numéro, pas de son rang dans la
// sélection courante : cocher/décocher un autre tour ne repeint jamais les
// tours déjà affichés.
export function colorForLap(lapNumber) {
  const index = Math.max(0, lapNumber - 1) % CATEGORICAL_DARK.length;
  return CATEGORICAL_DARK[index];
}
