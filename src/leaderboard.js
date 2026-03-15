// Client-side leaderboard module - fetches/submits scores via API

const API_BASE = '/api/leaderboard';

export class Leaderboard {
  constructor() {
    this.allTimeEntries = [];
    this.dailyEntries = [];
    this.loading = false;
    this.error = null;
    this.lastSubmitRank = null;
    this.playerName = this._loadName();
  }

  _loadName() {
    try {
      return localStorage.getItem('hoops_player_name') || '';
    } catch {
      return '';
    }
  }

  saveName(name) {
    this.playerName = name;
    try {
      localStorage.setItem('hoops_player_name', name);
    } catch {
      // localStorage unavailable
    }
  }

  async fetchLeaderboard(type = 'alltime', limit = 20) {
    this.loading = true;
    this.error = null;
    try {
      const res = await fetch(`${API_BASE}?type=${type}&limit=${limit}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (type === 'daily') {
        this.dailyEntries = data.entries;
      } else {
        this.allTimeEntries = data.entries;
      }
    } catch (err) {
      this.error = 'Could not load leaderboard';
      console.warn('Leaderboard fetch error:', err);
    } finally {
      this.loading = false;
    }
  }

  async fetchBoth() {
    await Promise.all([
      this.fetchLeaderboard('alltime', 20),
      this.fetchLeaderboard('daily', 20),
    ]);
  }

  async submitScore(name, score, stage) {
    this.loading = true;
    this.error = null;
    this.lastSubmitRank = null;
    try {
      const res = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, score, stage }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.lastSubmitRank = data.rank;
      this.saveName(name);
      return data;
    } catch (err) {
      this.error = 'Could not submit score';
      console.warn('Leaderboard submit error:', err);
      return null;
    } finally {
      this.loading = false;
    }
  }
}
