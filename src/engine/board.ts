import {
  Board,
  Territory,
} from '../types';

type Rng = () => number;

// ============================================================
// #region BOARD GENERATION
// ============================================================

export function generateBoard(territoryCount: number, rng: Rng): Board {
  const temporaryCellCount = territoryCount * 2;

  const cols = Math.ceil(Math.sqrt(temporaryCellCount));
  const rows = Math.ceil(temporaryCellCount / cols);

  const remaining = new Set<number>();

  // Start with a small irregular seed instead of one
  // single center cell. This gives the map an organic
  // starting shape.
  const centerRow = Math.floor(rows / 2);
  const centerCol = Math.floor(cols / 2);

  const seedCandidates = [
    centerRow * cols + centerCol,
    (centerRow - 1) * cols + centerCol,
    (centerRow + 1) * cols + centerCol,
    centerRow * cols + centerCol - 1,
    centerRow * cols + centerCol + 1,
  ];

  for (const index of seedCandidates) {
    if (
      index >= 0 &&
      index < rows * cols
    ) {
      remaining.add(index);
    }
  }

  while (remaining.size < territoryCount) {
    const frontier = getFrontierCells(
      remaining,
      rows,
      cols
    );

    if (frontier.length === 0) {
      break;
    }

    // Randomize the frontier instead of sorting it by
    // neighbor count. This is what gives the coastline
    // its irregular character.
    for (
      let index = frontier.length - 1;
      index > 0;
      index -= 1
    ) {
      const randomIndex = Math.floor(
        rng() * (index + 1)
      );

      [
        frontier[index],
        frontier[randomIndex],
      ] = [
        frontier[randomIndex],
        frontier[index],
      ];
    }

    let selectedIndex: number | null = null;

    // Examine the randomized candidates.
    for (const candidate of frontier) {
      const neighbors = getCellNeighbors(
        candidate,
        remaining,
        rows,
        cols
      );

      // A candidate with 2+ existing neighbors naturally
      // connects to the body of the map.
      if (neighbors.length >= 2) {
        selectedIndex = candidate;
        break;
      }

      // One-neighbor cells are allowed, but only if they
      // don't extend an existing narrow section.
      if (
        neighbors.length === 1 &&
        !wouldCreateLongArm(
          candidate,
          remaining,
          rows,
          cols
        )
      ) {
        selectedIndex = candidate;
        break;
      }
    }

    // If every candidate was rejected, use a random
    // frontier cell as a safety fallback.
    if (selectedIndex === null) {
      selectedIndex =
        frontier[
          Math.floor(rng() * frontier.length)
        ];
    }

    remaining.add(selectedIndex);
  }

  const territories: Territory[] = [];

  for (const index of remaining) {
    territories.push({
      id: `t-${index + 1}`,
      owner: null,
      level: 1,
      neighbors: [],
      isMine: false,
      biome: 'forest',
    });
  }

  // Build neighbors.
  for (const territory of territories) {
    const index =
      Number(territory.id.slice(2)) - 1;

    territory.neighbors = getCellNeighbors(
      index,
      remaining,
      rows,
      cols
    ).map(
      (neighborIndex) =>
        `t-${neighborIndex + 1}`
    );
  }

  return {
    territories,
    mines: [],
    settlements: [],
    dimensions: { rows, cols },
  };
}

function getFrontierCells(
  remaining: Set<number>,
  rows: number,
  cols: number
): number[] {
  const frontier = new Set<number>();

  for (const index of remaining) {
    const row = Math.floor(index / cols);
    const col = index % cols;

    const neighbors = [
      { row: row - 1, col },
      { row: row + 1, col },
      { row, col: col - 1 },
      { row, col: col + 1 },
    ];

    for (const neighbor of neighbors) {
      if (
        neighbor.row < 0 ||
        neighbor.row >= rows ||
        neighbor.col < 0 ||
        neighbor.col >= cols
      ) {
        continue;
      }

      const neighborIndex =
        neighbor.row * cols + neighbor.col;

      if (!remaining.has(neighborIndex)) {
        frontier.add(neighborIndex);
      }
    }
  }

  return Array.from(frontier);
}

function getCellNeighbors(
  index: number,
  remaining: Set<number>,
  rows: number,
  cols: number
): number[] {
  const row = Math.floor(index / cols);
  const col = index % cols;

  const possibleNeighbors = [
    { row: row - 1, col },
    { row: row + 1, col },
    { row, col: col - 1 },
    { row, col: col + 1 },
  ];

  const neighbors: number[] = [];

  for (const neighbor of possibleNeighbors) {
    if (
      neighbor.row < 0 ||
      neighbor.row >= rows ||
      neighbor.col < 0 ||
      neighbor.col >= cols
    ) {
      continue;
    }

    const neighborIndex =
      neighbor.row * cols + neighbor.col;

    if (remaining.has(neighborIndex)) {
      neighbors.push(neighborIndex);
    }
  }

  return neighbors;
}

function wouldCreateLongArm(
  index: number,
  remaining: Set<number>,
  rows: number,
  cols: number
): boolean {
  const testSet = new Set(remaining);
  testSet.add(index);

  let current = index;
  let previous = -1;
  let length = 0;

  while (length < 4) {
    const neighbors = getCellNeighbors(
      current,
      testSet,
      rows,
      cols
    ).filter(
      (neighbor) => neighbor !== previous
    );

    // We've reached the body of the map.
    if (neighbors.length !== 1) {
      break;
    }

    previous = current;
    current = neighbors[0];
    length += 1;
  }

  return length >= 3;
}

// ============================================================
// #region BOARD CLEANUP
// ============================================================

export function fillEnclosedBoardHoles(
  territories: Territory[],
  dimensions: { rows: number; cols: number }
): void {
  const { rows, cols } = dimensions;

  const existingCells = new Set<number>();

  for (const territory of territories) {
    const index =
      Number(territory.id.slice(2)) - 1;

    existingCells.add(index);
  }

  /*
   * Find every empty cell that is connected to the
   * outside edge of the temporary grid.
   *
   * Those cells are NOT holes.
   */
  const outsideCells = new Set<number>();
  const queue: number[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (
        row !== 0 &&
        row !== rows - 1 &&
        col !== 0 &&
        col !== cols - 1
      ) {
        continue;
      }

      const index = row * cols + col;

      if (
        !existingCells.has(index) &&
        !outsideCells.has(index)
      ) {
        outsideCells.add(index);
        queue.push(index);
      }
    }
  }

  /*
   * Flood-fill all empty space connected to the
   * outside of the map.
   */
  let queueIndex = 0;

  while (queueIndex < queue.length) {
    const current = queue[queueIndex];
    queueIndex += 1;

    const row = Math.floor(current / cols);
    const col = current % cols;

    const neighbors = [
      { row: row - 1, col },
      { row: row + 1, col },
      { row, col: col - 1 },
      { row, col: col + 1 },
    ];

    for (const neighbor of neighbors) {
      if (
        neighbor.row < 0 ||
        neighbor.row >= rows ||
        neighbor.col < 0 ||
        neighbor.col >= cols
      ) {
        continue;
      }

      const neighborIndex =
        neighbor.row * cols + neighbor.col;

      if (
        existingCells.has(neighborIndex) ||
        outsideCells.has(neighborIndex)
      ) {
        continue;
      }

      outsideCells.add(neighborIndex);
      queue.push(neighborIndex);
    }
  }

  /*
   * Any empty cell that was NOT reached by the flood-fill
   * is enclosed inside the map and therefore needs to
   * become a territory.
   */
  const holeCells: number[] = [];

  for (let index = 0; index < rows * cols; index += 1) {
    if (
      !existingCells.has(index) &&
      !outsideCells.has(index)
    ) {
      holeCells.push(index);
    }
  }

  if (holeCells.length === 0) {
    return;
  }

  /*
   * Assign each hole the most common biome among its
   * immediately adjacent EXISTING territories.
   */
  for (const index of holeCells) {
    const row = Math.floor(index / cols);
    const col = index % cols;

    const adjacentBiomes: string[] = [];

    const neighbors = [
      { row: row - 1, col },
      { row: row + 1, col },
      { row, col: col - 1 },
      { row, col: col + 1 },
    ];

    for (const neighbor of neighbors) {
      if (
        neighbor.row < 0 ||
        neighbor.row >= rows ||
        neighbor.col < 0 ||
        neighbor.col >= cols
      ) {
        continue;
      }

      const neighborIndex =
        neighbor.row * cols + neighbor.col;

      if (!existingCells.has(neighborIndex)) {
        continue;
      }

      const neighborTerritory =
        territories.find(
          (territory) =>
            Number(territory.id.slice(2)) - 1 ===
            neighborIndex
        );

      if (neighborTerritory) {
        adjacentBiomes.push(
          neighborTerritory.biome
        );
      }
    }

    const biomeCounts = new Map<string, number>();

    for (const biome of adjacentBiomes) {
      biomeCounts.set(
        biome,
        (biomeCounts.get(biome) ?? 0) + 1
      );
    }

    let mostCommonBiome = 'forest';
    let highestCount = 0;

    for (const [biome, count] of biomeCounts) {
      if (count > highestCount) {
        mostCommonBiome = biome;
        highestCount = count;
      }
    }

    territories.push({
      id: `t-${index + 1}`,
      owner: null,
      level: 1,
      neighbors: [],
      isMine: false,
      biome: mostCommonBiome as Territory['biome'],
    });
  }

  /*
   * Rebuild neighbors now that the holes have become
   * territories.
   */
  const allTerritoriesByIndex = new Map<
    number,
    Territory
  >();

  for (const territory of territories) {
    const index =
      Number(territory.id.slice(2)) - 1;

    allTerritoriesByIndex.set(
      index,
      territory
    );
  }

  for (const territory of territories) {
    const index =
      Number(territory.id.slice(2)) - 1;

    const row = Math.floor(index / cols);
    const col = index % cols;

    const neighborIndexes = [
      { row: row - 1, col },
      { row: row + 1, col },
      { row, col: col - 1 },
      { row, col: col + 1 },
    ];

    territory.neighbors = neighborIndexes
      .filter(
        (neighbor) =>
          neighbor.row >= 0 &&
          neighbor.row < rows &&
          neighbor.col >= 0 &&
          neighbor.col < cols
      )
      .map(
        (neighbor) =>
          neighbor.row * cols + neighbor.col
      )
      .filter((neighborIndex) =>
        allTerritoriesByIndex.has(
          neighborIndex
        )
      )
      .map(
        (neighborIndex) =>
          `t-${neighborIndex + 1}`
      );
  }
}

// ============================================================
// #region MOUNTAIN BIOMES / MINES
// ============================================================

const MAX_MOUNTAIN_PERCENT = 0.30;
const MIN_MOUNTAIN_PERCENT = 0.20;
const MAX_MOUNTAIN_ATTEMPTS = 20;

export function generateMountainBiomes(
  territories: Territory[],
  dimensions: { rows: number; cols: number },
  mineCount: number,
  rng: Rng
): void {
  if (territories.length === 0) {
    return;
  }

  const targetMountainCount = Math.max(
    Math.ceil(territories.length * MIN_MOUNTAIN_PERCENT),
    mineCount * 5
  );

  const maxMountainCount = Math.floor(
    territories.length * MAX_MOUNTAIN_PERCENT
  );

  const mountainTarget = Math.min(
    targetMountainCount,
    maxMountainCount
  );

  for (let attempt = 0; attempt < MAX_MOUNTAIN_ATTEMPTS; attempt += 1) {
    for (const territory of territories) {
      territory.biome = 'forest';
    }

    const mountainIds = new Set<string>();

    const rangeCount = Math.max(
      2,
      Math.min(4, Math.ceil(territories.length / 250))
    );

    // Pick random starting points.
    const shuffled = [...territories];

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(rng() * (index + 1));

      [shuffled[index], shuffled[randomIndex]] = [
        shuffled[randomIndex],
        shuffled[index],
      ];
    }

    for (let index = 0; index < rangeCount; index += 1) {
      mountainIds.add(shuffled[index].id);
    }

    while (mountainIds.size < mountainTarget) {
      const frontier = territories.filter(
        (territory) =>
          !mountainIds.has(territory.id) &&
          territory.neighbors.some((neighborId) =>
            mountainIds.has(neighborId)
          )
      );

      if (frontier.length === 0) {
        break;
      }

      const scored = frontier.map((territory) => {
        const mountainNeighbors =
          territory.neighbors.filter((neighborId) =>
            mountainIds.has(neighborId)
          ).length;

        let score = rng();

        /*
        * Prefer 2-3 mountain neighbors.
        *
        * One neighbor extends the range too aggressively.
        * Four+ neighbors usually means we're filling a hole
        * and creating a rectangular shape.
        */
        if (mountainNeighbors === 1) {
          score -= 4.5;
        } else if (mountainNeighbors === 2) {
          score += 6;
        } else if (mountainNeighbors === 3) {
          score += 4.5;
        } else if (mountainNeighbors >= 4) {
          score += 3;
        }

        return {
          territory,
          score,
        };
      });

      scored.sort((a, b) => b.score - a.score);

      /*
      * Choose randomly from the strongest candidates.
      * This keeps the edge irregular without creating
      * lots of holes inside the mountain range.
      */
      const candidateCount = Math.min(
        90,
        scored.length
      );

      const selected =
        scored[
          Math.floor(rng() * candidateCount)
        ].territory;

      mountainIds.add(selected.id);
    }

    for (const territory of territories) {
      if (mountainIds.has(territory.id)) {
        territory.biome = 'mountain';
      }
    }

    const mineCandidates = territories.filter(
      (territory) =>
        territory.biome === 'mountain' &&
        hasEightMountainNeighbors(
          territory,
          territories,
          dimensions
        )
    );

    if (mineCandidates.length >= mineCount) {
      return;
    }
  }

  expandMountainsForMines(
    territories,
    dimensions,
    mineCount
  );
}

function countMountainNeighbors(
  territory: Territory,
  territories: Territory[]
): number {
  return territory.neighbors.filter((neighborId) => {
    const neighbor = territories.find(
      (entry) => entry.id === neighborId
    );

    return neighbor?.biome === 'mountain';
  }).length;
}

function hasEightMountainNeighbors(
  territory: Territory,
  territories: Territory[],
  dimensions: { rows: number; cols: number }
): boolean {
  const index =
    Number(territory.id.slice(2)) - 1;

  const row =
    Math.floor(index / dimensions.cols);

  const col =
    index % dimensions.cols;

  // A mine needs all 8 surrounding cells,
  // so edge territories can never be mines.
  if (
    row === 0 ||
    row === dimensions.rows - 1 ||
    col === 0 ||
    col === dimensions.cols - 1
  ) {
    return false;
  }

  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
      if (
        rowOffset === 0 &&
        colOffset === 0
      ) {
        continue;
      }

      const neighborRow =
        row + rowOffset;

      const neighborCol =
        col + colOffset;

      const neighborIndex =
        neighborRow * dimensions.cols +
        neighborCol;

      const neighbor =
        territories.find(
          (entry) =>
            Number(entry.id.slice(2)) - 1 ===
            neighborIndex
        );

      if (
        !neighbor ||
        neighbor.biome !== 'mountain'
      ) {
        return false;
      }
    }
  }

  return true;
}

function hasPotentialMineNeighbors(
  territory: Territory,
  territories: Territory[],
  dimensions: { rows: number; cols: number }
): boolean {
  const index =
    Number(territory.id.slice(2)) - 1;

  const row =
    Math.floor(index / dimensions.cols);

  const col =
    index % dimensions.cols;

  if (
    row === 0 ||
    row === dimensions.rows - 1 ||
    col === 0 ||
    col === dimensions.cols - 1
  ) {
    return false;
  }

  let mountainNeighbors = 0;

  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
      if (
        rowOffset === 0 &&
        colOffset === 0
      ) {
        continue;
      }

      const neighborRow =
        row + rowOffset;

      const neighborCol =
        col + colOffset;

      const neighborIndex =
        neighborRow * dimensions.cols +
        neighborCol;

      const neighbor =
        territories.find(
          (entry) =>
            Number(entry.id.slice(2)) - 1 ===
            neighborIndex
        );

      if (
        neighbor?.biome === 'mountain'
      ) {
        mountainNeighbors += 1;
      }
    }
  }

  return mountainNeighbors >= 7;
}

function expandMountainsForMines(
  territories: Territory[],
  dimensions: { rows: number; cols: number },
  mineCount: number
): void {
  while (
    territories.filter(
      (territory) =>
        territory.biome === 'mountain' &&
        hasEightMountainNeighbors(
          territory,
          territories,
          dimensions
        )
    ).length < mineCount
  ) {
    const candidate = territories
      .filter(
        (territory) =>
          territory.biome === 'field' &&
          hasPotentialMineNeighbors(
            territory,
            territories,
            dimensions
          )
      )
      .sort((a, b) => {
        const aMountainNeighbors =
          countMountainNeighbors(
            a,
            territories
          );

        const bMountainNeighbors =
          countMountainNeighbors(
            b,
            territories
          );

        return (
          bMountainNeighbors -
          aMountainNeighbors
        );
      })[0];

    if (!candidate) {
      break;
    }

    candidate.biome = 'mountain';
  }
}

export function placeMines(
  territories: Territory[],
  dimensions: { rows: number; cols: number },
  mineCount: number,
  rng: Rng
): string[] {
  const mineTerritoryIds: string[] = [];

  const candidateTerritories = territories.filter(
    (territory) =>
      territory.biome === 'mountain' &&
      hasEightMountainNeighbors(
        territory,
        territories,
        dimensions
      )
  );

  // Shuffle candidates.
  for (
    let index = candidateTerritories.length - 1;
    index > 0;
    index -= 1
  ) {
    const randomIndex = Math.floor(
      rng() * (index + 1)
    );

    [
      candidateTerritories[index],
      candidateTerritories[randomIndex],
    ] = [
      candidateTerritories[randomIndex],
      candidateTerritories[index],
    ];
  }

  for (const territory of candidateTerritories) {
    if (mineTerritoryIds.length >= mineCount) {
      break;
    }

    mineTerritoryIds.push(territory.id);
  }

  return mineTerritoryIds;
}

// ============================================================
// #region FIELD BIOMES
// ============================================================

const FIELD_PERCENT_OF_FOREST = 0.15;

export function generateFieldBiomes(
  territories: Territory[],
  rng: Rng
): void {
  const forestTerritories = territories.filter(
    (territory) => territory.biome === 'forest'
  );

  if (forestTerritories.length === 0) {
    return;
  }

  const targetFieldCount = Math.floor(
    forestTerritories.length * FIELD_PERCENT_OF_FOREST
  );

  if (targetFieldCount <= 0) {
    return;
  }

  const fieldIds = new Set<string>();

  /*
   * --------------------------------------------------------
   * CREATE MULTIPLE SEPARATED CLEARINGS
   * --------------------------------------------------------
   *
   * The number of blobs scales with the amount of field.
   *
   * Larger maps therefore get more individual clearings
   * instead of one or two enormous geometric fields.
   */
  const blobCount = Math.max(
    2,
    Math.min(
      20,
      Math.round(targetFieldCount / 12)
    )
  );

  const shuffled = [...forestTerritories];

  shuffleArray(shuffled, rng);

  /*
   * Pick seeds that are not directly adjacent.
   *
   * This keeps the initial clearings separated.
   */
  for (const territory of shuffled) {
    if (fieldIds.size >= blobCount) {
      break;
    }

    const tooClose = territory.neighbors.some(
      (neighborId) => fieldIds.has(neighborId)
    );

    if (!tooClose) {
      fieldIds.add(territory.id);
    }
  }

  /*
   * Fallback for unusually dense/small maps.
   */
  if (fieldIds.size < blobCount) {
    for (const territory of shuffled) {
      if (fieldIds.size >= blobCount) {
        break;
      }

      fieldIds.add(territory.id);
    }
  }

  /*
   * --------------------------------------------------------
   * GROW THE CLEARINGS
   * --------------------------------------------------------
   *
   * Each iteration evaluates the entire field frontier.
   *
   * The important difference from the old version is that
   * we DON'T simply reward lots of field neighbors.
   *
   * Instead we reward:
   *
   *   - some connection to the field
   *   - irregular edges
   *   - occasional protrusions
   *   - avoiding perfectly filled corners
   */
  while (fieldIds.size < targetFieldCount) {
    const frontier = forestTerritories.filter(
      (territory) =>
        !fieldIds.has(territory.id) &&
        territory.neighbors.some((neighborId) =>
          fieldIds.has(neighborId)
        )
    );

    if (frontier.length === 0) {
      break;
    }

    const scored = frontier.map((territory) => {
      const fieldNeighbors =
        territory.neighbors.filter((neighborId) =>
          fieldIds.has(neighborId)
        ).length;

      let score = rng() * 4;

      /*
       * ----------------------------------------------------
       * FIELD CONNECTION
       * ----------------------------------------------------
       *
       * We still want fields to form blobs, but we don't
       * want them to become perfectly compact.
       */
      if (fieldNeighbors === 1) {
        /*
         * One neighbor creates an irregular extension.
         *
         * Give this a reasonable chance rather than heavily
         * penalizing it.
         */
        score += 3;
      } else if (fieldNeighbors === 2) {
        /*
         * Two neighbors is ideal for organic growth.
         */
        score += 6;
      } else if (fieldNeighbors === 3) {
        /*
         * Three neighbors fills the blob nicely, but is
         * slightly less desirable than two.
         */
        score += 4;
      } else if (fieldNeighbors >= 4) {
        /*
         * Four neighbors often means we're filling an
         * interior corner and making the shape rectangular.
         */
        score -= 3;
      }

      /*
       * ----------------------------------------------------
       * DETECT SQUARE / RECTANGULAR CORNERS
       * ----------------------------------------------------
       *
       * If the candidate has several field neighbors that
       * form a compact shape around it, penalize it.
       *
       * This helps prevent:
       *
       *     F F F
       *     F . F
       *     F F F
       *
       * from being filled in repeatedly.
       */
      const fieldNeighborTerritories =
        territory.neighbors
          .map((neighborId) =>
            forestTerritories.find(
              (entry) => entry.id === neighborId
            )
          )
          .filter(
            (neighbor): neighbor is Territory =>
              neighbor !== undefined &&
              fieldIds.has(neighbor.id)
          );

      let nearbyFieldConnections = 0;

      for (
        let index = 0;
        index < fieldNeighborTerritories.length;
        index += 1
      ) {
        for (
          let otherIndex = index + 1;
          otherIndex < fieldNeighborTerritories.length;
          otherIndex += 1
        ) {
          const first =
            fieldNeighborTerritories[index];

          const second =
            fieldNeighborTerritories[otherIndex];

          if (
            first.neighbors.includes(
              second.id
            )
          ) {
            nearbyFieldConnections += 1;
          }
        }
      }

      /*
       * Lots of neighboring field cells that are also
       * connected to each other means this candidate is
       * probably filling a compact/rectangular section.
       */
      score -=
        nearbyFieldConnections * 2.5;

      /*
       * ----------------------------------------------------
       * RANDOM IRREGULARITY
       * ----------------------------------------------------
       *
       * Occasionally favor a less-connected cell.
       *
       * This produces little bumps and peninsulas along
       * the edge of the clearing.
       */
      if (rng() < 0.20) {
        score +=
          (4 - fieldNeighbors) * 1.5;
      }

      /*
       * ----------------------------------------------------
       * AVOID HUGE UNBROKEN CLEARINGS
       * ----------------------------------------------------
       *
       * Look at the immediate neighborhood and slightly
       * discourage candidates surrounded by many fields.
       */
      if (fieldNeighbors >= 3) {
        score -= rng() * 3;
      }

      return {
        territory,
        score,
      };
    });

    scored.sort(
      (a, b) => b.score - a.score
    );

    /*
     * Choose from a fairly large group of good candidates.
     *
     * The old value of 20 becomes too deterministic on large
     * maps because the top candidates tend to be very similar.
     *
     * Using roughly the top 15% keeps the growth organic.
     */
    const candidateCount = Math.max(
      5,
      Math.min(
        Math.ceil(scored.length * 0.15),
        100
      )
    );

    const selected =
      scored[
        Math.floor(
          rng() * candidateCount
        )
      ].territory;

    fieldIds.add(
      selected.id
    );
  }

  /*
   * --------------------------------------------------------
   * APPLY FIELD BIOME
   * --------------------------------------------------------
   */
  for (const territory of territories) {
    if (fieldIds.has(territory.id)) {
      territory.biome = 'field';
    }
  }
}

// ============================================================
// #region RIVER BIOMES
// ============================================================

const MAX_RIVER_SOURCES = 10;

export function generateRiverBiomes(
  territories: Territory[],
  dimensions: { rows: number; cols: number },
  rng: Rng
): void {
  if (territories.length === 0) {
    return;
  }

  /*
   * --------------------------------------------------------
   * FIND VALID MOUNTAIN SOURCES
   * --------------------------------------------------------
   *
   * A source must:
   *
   * 1. Be inside a mountain range.
   * 2. Have at least 3 mountain neighbors.
   * 3. Have at least one non-mountain neighbor.
   *
   * The source itself stays mountain. The river emerges
   * from one of its non-mountain neighbors.
   */
  const mountainSources = territories.filter(
    (territory) => {
      if (
        territory.biome !== 'mountain'
      ) {
        return false;
      }

      const mountainNeighbors =
        countMountainNeighbors(
          territory,
          territories
        );

      const hasExit =
        territory.neighbors.some(
          (neighborId) => {
            const neighbor =
              territories.find(
                (entry) =>
                  entry.id ===
                  neighborId
              );

            return (
              neighbor &&
              neighbor.biome !==
                'mountain'
            );
          }
        );

      return (
        mountainNeighbors >= 3 &&
        hasExit
      );
    }
  );

  if (
    mountainSources.length === 0
  ) {
    return;
  }

  shuffleArray(
    mountainSources,
    rng
  );

  /*
   * We want a few major rivers, not dozens of little streams.
   */
  const sourceCount = Math.min(
    MAX_RIVER_SOURCES,
    mountainSources.length,
    Math.max(
      1,
      Math.ceil(
        territories.length / 300
      )
    )
  );

  /*
   * These are the actual river territories.
   */
  const riverIds =
    new Set<string>();

  /*
   * Sources remain mountains.
   */
  const sourceIds =
    new Set<string>();

  /*
   * --------------------------------------------------------
   * CREATE RIVERS
   * --------------------------------------------------------
   */
  for (
    let sourceIndex = 0;
    sourceIndex < sourceCount;
    sourceIndex += 1
  ) {
    const source =
      mountainSources[
        sourceIndex
      ];

    sourceIds.add(
      source.id
    );

    /*
     * ------------------------------------------------------
     * FIND A COMPLETE PATH FROM THE MOUNTAIN TO THE COAST
     * ------------------------------------------------------
     *
     * This is the important change.
     *
     * We don't greedily walk until we get stuck anymore.
     *
     * Instead, we search the map for an actual route to the
     * coast.
     */
    const path =
      findRiverPathToCoast(
        source,
        territories,
        dimensions,
        riverIds,
        rng
      );

    /*
     * If there is no route from this source to the coast,
     * simply try the next mountain source.
     */
    if (
      path.length === 0
    ) {
      continue;
    }

    /*
     * Add the complete path to the river system.
     */
    for (
      const territoryId of path
    ) {
      /*
       * Never turn the mountain source itself into river.
       */
      if (
        sourceIds.has(
          territoryId
        )
      ) {
        continue;
      }

      riverIds.add(
        territoryId
      );
    }
  }

  /*
   * --------------------------------------------------------
   * APPLY RIVER BIOME
   * --------------------------------------------------------
   *
   * Only the actual path becomes river.
   *
   * Mountain sources remain mountains.
   */
  for (
    const territory of territories
  ) {
    if (
      riverIds.has(
        territory.id
      ) &&
      !sourceIds.has(
        territory.id
      )
    ) {
      territory.biome =
        'river';
    }
  }
}

function findRiverPathToCoast(
  source: Territory,
  territories: Territory[],
  dimensions: { rows: number; cols: number },
  riverIds: Set<string>,
  rng: Rng
): string[] {
  /*
   * --------------------------------------------------------
   * FIND POSSIBLE STARTING EXITS
   * --------------------------------------------------------
   *
   * The river starts by leaving the mountain range.
   */
  const exits =
    source.neighbors
      .map((neighborId) =>
        territories.find(
          (territory) =>
            territory.id ===
            neighborId
        )
      )
      .filter(
        (
          territory
        ): territory is Territory =>
          Boolean(territory)
      )
      .filter(
        (territory) =>
          territory.biome !==
          'mountain'
      );

  if (
    exits.length === 0
  ) {
    return [];
  }

  /*
   * Randomize the exits so maps don't always use the same
   * mountain outlet.
   */
  shuffleArray(
    exits,
    rng
  );

  /*
   * Try each possible mountain exit.
   *
   * If one exit gets trapped, try another.
   */
  const rankedExits =
    exits
      .map((territory) => ({
        territory,
        score:
          getRiverDirectionScore(
            source,
            territory,
            dimensions,
            null,
            rng
          ),
      }))
      .sort(
        (a, b) =>
          b.score - a.score
      );

  /*
   * Try the best exits first.
   */
  for (
    const exit of rankedExits
  ) {
    const path =
      searchRiverPath(
        source,
        exit.territory,
        territories,
        dimensions,
        riverIds,
        rng
      );

    if (
      path.length > 0
    ) {
      return path;
    }
  }

  return [];
}

function searchRiverPath(
  source: Territory,
  start: Territory,
  territories: Territory[],
  dimensions: { rows: number; cols: number },
  riverIds: Set<string>,
  rng: Rng
): string[] {
  /*
   * --------------------------------------------------------
   * DEPTH-FIRST SEARCH WITH BACKTRACKING
   * --------------------------------------------------------
   *
   * This is deliberately NOT a simple greedy walk.
   *
   * If the river goes down a dead-end:
   *
   *     R
   *     R
   *     R
   *    M M
   *
   * the algorithm backs up and tries another route.
   *
   * Therefore a river does not simply die after 7 or 8
   * territories because of one bad local choice.
   */

  const visited =
    new Set<string>();

  const path: string[] = [];

  /*
   * Keep the source visited so the river can never travel
   * back into the mountain source.
   */
  visited.add(
    source.id
  );

  const search = (
    current: Territory,
    previous: Territory | null,
    direction:
      | 'north'
      | 'south'
      | 'east'
      | 'west'
      | null
  ): boolean => {
    /*
    * ------------------------------------------------------
    * CONNECT TO EXISTING RIVER FIRST
    * ------------------------------------------------------
    *
    * If the current territory is directly adjacent to an
    * existing river, connect immediately.
    *
    * This MUST happen before the coast check so a river
    * doesn't stop at the coast when it could connect to
    * another river.
    */
    const adjacentRiver = current.neighbors
      .map((neighborId) =>
        territories.find(
          (territory) =>
            territory.id === neighborId
        )
      )
      .find(
        (territory) =>
          territory !== undefined &&
          riverIds.has(territory.id)
      );

    if (adjacentRiver) {
      path.push(current.id);
      path.push(adjacentRiver.id);

      return true;
    }

    /*
    * ------------------------------------------------------
    * COAST REACHED
    * ------------------------------------------------------
    *
    * If there is no river to connect to, the river can
    * terminate at the edge of the map.
    */
    if (
      isCoastTerritory(
        current,
        territories,
        dimensions
      )
    ) {
      path.push(current.id);

      return true;
    }

    /*
    * Mark this territory as visited for this search.
    */
    visited.add(
      current.id
    );

    /*
     * ------------------------------------------------------
     * GET CANDIDATES
     * ------------------------------------------------------
     */
    const candidates =
      current.neighbors
        .map((neighborId) =>
          territories.find(
            (territory) =>
              territory.id ===
              neighborId
          )
        )
        .filter(
          (
            territory
          ): territory is Territory =>
            Boolean(territory)
        )
        /*
         * Don't go backwards.
         */
        .filter(
          (territory) =>
            territory.id !==
            previous?.id
        )
        /*
         * Don't enter mountains.
         */
        .filter(
          (territory) =>
            territory.biome !==
            'mountain'
        )
        /*
         * Don't revisit territory while searching this path.
         */
        .filter(
          (territory) =>
            !visited.has(
              territory.id
            )
        );

    /*
     * If there are no candidates, this is a dead end.
     *
     * Returning false causes the caller to backtrack.
     */
    if (
      candidates.length === 0
    ) {
      return false;
    }

    /*
     * ------------------------------------------------------
     * SCORE CANDIDATES
     * ------------------------------------------------------
     *
     * South is preferred.
     * Continuing in the same direction is preferred.
     * East/west movement is allowed for meandering.
     * North is strongly discouraged.
     */
    const scored =
      candidates.map(
        (territory) => {
          let score =
            getRiverDirectionScore(
              current,
              territory,
              dimensions,
              direction,
              rng,
              territories,
              riverIds
            );

          /*
          * ----------------------------------------------------
          * RIVER BRIDGE PRIORITY
          * ----------------------------------------------------
          *
          * If this candidate is directly adjacent to an
          * existing river, this territory is the bridge.
          *
          * Example:
          *
          *     R . R
          *
          * If the river is currently at the left R, the "."
          * becomes extremely attractive because claiming it
          * will allow the next step to connect to the right R.
          *
          * This is intentionally a very large bonus.
          * It makes connecting to another river effectively
          * mandatory once the bridge is available.
          */
          const hasAdjacentRiver =
            territory.neighbors.some(
              (neighborId) =>
                riverIds.has(
                  neighborId
                )
            );

          if (hasAdjacentRiver) {
            score += 25;
          }

          return {
            territory,
            score,
          };
        }
      );

    /*
    * Sort primarily by score.
    */
    scored.sort(
      (a, b) =>
        b.score - a.score
    );

    /*
    * Shuffle candidates whose scores are close together.
    *
    * Without this, the best candidate almost always wins.
    *
    * With this, if:
    *
    *   south = 8.2
    *   east  = 7.9
    *   west  = 7.7
    *
    * the river has a real chance to choose east or west.
    */
    for (
      let index = 0;
      index < scored.length - 1;
      index += 1
    ) {
      const currentScore =
        scored[index].score;

      const nextScore =
        scored[index + 1].score;

      if (
        Math.abs(
          currentScore -
            nextScore
        ) <= 2
      ) {
        if (rng() < 0.45) {
          [
            scored[index],
            scored[index + 1],
          ] = [
            scored[index + 1],
            scored[index],
          ];
        }
      }
    }

    /*
     * ------------------------------------------------------
     * TRY EACH ROUTE
     * ------------------------------------------------------
     *
     * Otherwise, continue searching normally.
     *
     * Backtracking still allows the river to abandon a bad
     * route and try another route toward the coast.
     */
    for (
      const candidate of scored
    ) {
      const nextDirection =
        getDirection(
          current,
          candidate.territory,
          dimensions
        );

      if (
        search(
          candidate.territory,
          current,
          nextDirection
        )
      ) {
        path.push(
          current.id
        );

        return true;
      }
    }

    /*
     * None of the routes from this territory reached the
     * coast.
     *
     * Backtrack.
     */
    return false;
  };

  const success =
    search(
      start,
      source,
      null
    );

  if (!success) {
    return [];
  }

  /*
   * The recursive search builds the path backwards.
   *
   * Reverse it so it runs:
   *
   * mountain -> coast
   */
  return path.reverse();
}

function getRiverDirectionScore(
  current: Territory,
  next: Territory,
  dimensions: { rows: number; cols: number },
  previousDirection:
    | 'north'
    | 'south'
    | 'east'
    | 'west'
    | null,
  rng: Rng,
  territories?: Territory[],
  riverIds?: Set<string>
): number {
  const direction = getDirection(
    current,
    next,
    dimensions
  );

  let score = 0;

  /*
   * ========================================================
   * 1. SOUTHWARD MOVEMENT
   * ========================================================
   *
   * This is one third of the river's behavior.
   *
   * South should be preferred, but not overwhelmingly so.
   */
  if (direction === 'south') {
    score += 3;
  }

  /*
   * East/west movement is almost as desirable as south.
   *
   * This gives the river room to meander.
   */
  if (
    direction === 'east' ||
    direction === 'west'
  ) {
    score += 2.5;
  }

  /*
   * North is allowed because terrain may require the river
   * to temporarily move north.
   */
  if (direction === 'north') {
    score -= 2;
  }

  /*
   * ========================================================
   * 2. CONTINUE THE CURRENT DIRECTION
   * ========================================================
   *
   * This prevents the river from looking like:
   *
   *     ↓ → ↓ → ↓ → ↓
   *
   * and encourages broader bends:
   *
   *     → → → ↓
   *             ↓
   *             ↓
   *             ← ←
   */
  if (
    previousDirection &&
    direction === previousDirection
  ) {
    score += 2.5;
  }

  /*
   * Encourage a change from south into a horizontal bend.
   */
  if (
    previousDirection === 'south' &&
    (
      direction === 'east' ||
      direction === 'west'
    )
  ) {
    score += 2;
  }

  /*
   * Encourage returning south after a horizontal bend.
   */
  if (
    (
      previousDirection === 'east' ||
      previousDirection === 'west'
    ) &&
    direction === 'south'
  ) {
    score += 2;
  }

  /*
   * ========================================================
   * 3. AVOID SHARP REVERSALS
   * ========================================================
   */
  if (
    previousDirection === 'south' &&
    direction === 'north'
  ) {
    score -= 8;
  }

  if (
    previousDirection === 'north' &&
    direction === 'south'
  ) {
    score -= 8;
  }

  if (
    previousDirection === 'east' &&
    direction === 'west'
  ) {
    score -= 8;
  }

  if (
    previousDirection === 'west' &&
    direction === 'east'
  ) {
    score -= 8;
  }

  /*
   * ========================================================
   * 4. MOUNTAIN AVOIDANCE
   * ========================================================
   *
   * This is another one third of the behavior.
   *
   * We don't simply ask:
   *
   * "Does this territory touch a mountain?"
   *
   * Instead we calculate the distance to nearby mountains.
   *
   * The farther away the territory is, the better.
   *
   * When there are mountains on BOTH sides, the center
   * between them naturally becomes attractive.
   */
  if (territories) {
    const mountainDistance =
      getMountainDistance(
        next,
        territories,
        dimensions
      );

    /*
     * Cap the effect so mountain avoidance doesn't become
     * more important than the other two factors.
     */
    const mountainScore =
      Math.min(
        mountainDistance / 6,
        1
      );

    score +=
      mountainScore * 3;
  }

  /*
   * ========================================================
   * 5. RIVER ATTRACTION
   * ========================================================
   *
   * This is the final third.
   *
   * Existing rivers should attract the new river.
   *
   * This allows tributaries to eventually converge.
   */
  if (
    territories &&
    riverIds
  ) {
    const riverDistance =
      getRiverDistance(
        next,
        territories,
        riverIds,
        dimensions
      );

    /*
     * Closer existing rivers = stronger attraction.
     */
    const riverAttraction =
      Math.max(
        0,
        1 -
          riverDistance / 6
      );

    score +=
      riverAttraction * 3;
  }

  /*
  * ========================================================
  * DIRECT RIVER CONNECTION
  * ========================================================
  *
  * If this territory is immediately adjacent to an existing
  * river, strongly prefer it.
  *
  * This prevents rivers from stopping one territory short
  * when there is an actual connection available.
  */
    if (
      territories &&
      riverIds
    ) {
      const riverDistance =
        getRiverDistance(
          next,
          territories,
          riverIds,
          dimensions
        );

      if (riverDistance === 1) {
        score += 6;
      }
    }

  /*
   * ========================================================
   * RANDOMNESS
   * ========================================================
   *
   * Small randomness prevents identical paths while keeping
   * the three major geographic forces dominant.
   */
  score +=
    rng() * 2;

  return score;
}

function getMountainDistance(
  territory: Territory,
  territories: Territory[],
  dimensions: { rows: number; cols: number }
): number {
  const territoryIndex =
    Number(
      territory.id.slice(2)
    ) - 1;

  const territoryRow =
    Math.floor(
      territoryIndex /
        dimensions.cols
    );

  const territoryCol =
    territoryIndex %
    dimensions.cols;

  let closestDistance =
    Infinity;

  for (
    const candidate of territories
  ) {
    if (
      candidate.biome !==
      'mountain'
    ) {
      continue;
    }

    const candidateIndex =
      Number(
        candidate.id.slice(2)
      ) - 1;

    const candidateRow =
      Math.floor(
        candidateIndex /
          dimensions.cols
      );

    const candidateCol =
      candidateIndex %
      dimensions.cols;

    const distance =
      Math.abs(
        territoryRow -
          candidateRow
      ) +
      Math.abs(
        territoryCol -
          candidateCol
      );

    if (
      distance <
      closestDistance
    ) {
      closestDistance =
        distance;
    }
  }

  return closestDistance;
}

function getRiverDistance(
  territory: Territory,
  territories: Territory[],
  riverIds: Set<string>,
  dimensions: { rows: number; cols: number }
): number {
  const territoryIndex =
    Number(
      territory.id.slice(2)
    ) - 1;

  const territoryRow =
    Math.floor(
      territoryIndex /
        dimensions.cols
    );

  const territoryCol =
    territoryIndex %
    dimensions.cols;

  let closestDistance =
    Infinity;

  for (
    const riverId of riverIds
  ) {
    const riverTerritory =
      territories.find(
        (entry) =>
          entry.id === riverId
      );

    if (!riverTerritory) {
      continue;
    }

    const riverIndex =
      Number(
        riverTerritory.id.slice(2)
      ) - 1;

    const riverRow =
      Math.floor(
        riverIndex /
          dimensions.cols
      );

    const riverCol =
      riverIndex %
      dimensions.cols;

    const distance =
      Math.abs(
        territoryRow -
          riverRow
      ) +
      Math.abs(
        territoryCol -
          riverCol
      );

    if (
      distance <
      closestDistance
    ) {
      closestDistance =
        distance;
    }
  }

  return closestDistance;
}

function isCoastTerritory(
  territory: Territory,
  territories: Territory[],
  dimensions: { rows: number; cols: number }
): boolean {
  const index =
    Number(
      territory.id.slice(2)
    ) - 1;

  const row =
    Math.floor(
      index /
        dimensions.cols
    );

  const col =
    index %
    dimensions.cols;

  if (
    row === 0 ||
    row === dimensions.rows - 1 ||
    col === 0 ||
    col === dimensions.cols - 1
  ) {
    return true;
  }

  const possibleNeighbors = [
    {
      row: row - 1,
      col,
    },
    {
      row: row + 1,
      col,
    },
    {
      row,
      col: col - 1,
    },
    {
      row,
      col: col + 1,
    },
  ];

  for (
    const neighbor of possibleNeighbors
  ) {
    if (
      neighbor.row < 0 ||
      neighbor.row >= dimensions.rows ||
      neighbor.col < 0 ||
      neighbor.col >= dimensions.cols
    ) {
      return true;
    }

    const neighborIndex =
      neighbor.row *
        dimensions.cols +
      neighbor.col;

    const neighborId =
      `t-${neighborIndex + 1}`;

    const exists =
      territories.some(
        (entry) =>
          entry.id === neighborId
      );

    if (!exists) {
      return true;
    }
  }

  return false;
}

function getDirection(
  current: Territory,
  next: Territory,
  dimensions: { rows: number; cols: number }
):
  | 'north'
  | 'south'
  | 'east'
  | 'west' {
  const currentIndex =
    Number(
      current.id.slice(2)
    ) - 1;

  const nextIndex =
    Number(
      next.id.slice(2)
    ) - 1;

  const currentRow =
    Math.floor(
      currentIndex /
        dimensions.cols
    );

  const currentCol =
    currentIndex %
    dimensions.cols;

  const nextRow =
    Math.floor(
      nextIndex /
        dimensions.cols
    );

  const nextCol =
    nextIndex %
    dimensions.cols;

  if (
    nextRow > currentRow
  ) {
    return 'south';
  }

  if (
    nextRow < currentRow
  ) {
    return 'north';
  }

  if (
    nextCol > currentCol
  ) {
    return 'east';
  }

  return 'west';
}

// ============================================================
// #region GENERAL UTILITY
// ============================================================

function shuffleArray<T>(
  array: T[],
  rng: Rng
): void {
  for (
    let index = array.length - 1;
    index > 0;
    index -= 1
  ) {
    const randomIndex =
      Math.floor(
        rng() *
          (index + 1)
      );

    [
      array[index],
      array[randomIndex],
    ] = [
      array[randomIndex],
      array[index],
    ];
  }
}
