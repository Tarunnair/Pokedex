const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());

const cache = {};

async function cachedFetch(url) {
  if (cache[url]) return cache[url];
  const res = await fetch(url);
  const data = await res.json();
  cache[url] = data;
  return data;
}

// Gen 1: #1-151, Gen 2: #152-251
const GEN_RANGES = { 1: [1, 151], 2: [152, 251] };

// GET /api/pokemon?gen=1
app.get('/api/pokemon', async (req, res) => {
  try {
    const gen = parseInt(req.query.gen) || 1;
    const [start, end] = GEN_RANGES[gen] || GEN_RANGES[1];
    const data = await cachedFetch(`https://pokeapi.co/api/v2/pokemon?offset=${start - 1}&limit=${end - start + 1}`);

    const pokemon = await Promise.all(
      data.results.map(async (p, i) => {
        const id = start + i;
        const details = await cachedFetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
        return {
          id,
          name: details.name,
          types: details.types.map(t => t.type.name),
          sprite: details.sprites.other['official-artwork'].front_default || details.sprites.front_default
        };
      })
    );

    res.json(pokemon);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch pokemon' });
  }
});

// GET /api/pokemon/:id/evolution
app.get('/api/pokemon/:id/evolution', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const species = await cachedFetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`);
    const evoData = await cachedFetch(species.evolution_chain.url);

    const chain = [];
    let current = evoData.chain;

    while (current) {
      const speciesName = current.species.name;
      const speciesId = parseInt(current.species.url.split('/').filter(Boolean).pop());
      const details = await cachedFetch(`https://pokeapi.co/api/v2/pokemon/${speciesId}`);
      chain.push({
        id: speciesId,
        name: speciesName,
        sprite: details.sprites.other['official-artwork'].front_default || details.sprites.front_default
      });
      current = current.evolves_to[0] || null;
    }

    res.json({ chain, currentId: id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch evolution chain' });
  }
});

// GET /api/types
app.get('/api/types', async (req, res) => {
  try {
    const data = await cachedFetch('https://pokeapi.co/api/v2/type');
    const types = data.results
      .map(t => t.name)
      .filter(t => t !== 'unknown' && t !== 'shadow');
    res.json(types);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch types' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
