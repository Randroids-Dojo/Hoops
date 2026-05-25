// Score, streak, and stage logic

import { readStorage, writeStorage } from '@randroids-dojo/vibekit';
import { z } from 'zod';
import { STREAK, BONUS_TIME_THRESHOLD, getStageData } from './utils.js';

const HIGH_SCORES_KEY = 'hoops_highscores';
const HighScoreEntrySchema = z.object({
  score: z.number(),
  stage: z.number(),
  date: z.string(),
});
const HighScoresSchema = z.array(HighScoreEntrySchema);

export class Scoring {
  constructor() {
    this.streak = 0;
    this.stageNum = 1;
    this.stageScore = 0; // score earned in current stage
    this.timeRemaining = 30;
    this.bonusTimeActive = false;
    this.highScores = this._loadHighScores();
    this.totalScore = 0;

    this.stageData = getStageData(1);
  }

  reset() {
    this.streak = 0;
    this.stageNum = 1;
    this.stageScore = 0;
    this.totalScore = 0;
    this.bonusTimeActive = false;
    this.stageData = getStageData(1);
    this.timeRemaining = this.stageData.time;
  }

  getStreakLevel() {
    if (this.streak >= STREAK.UNSTOPPABLE) return 4;
    if (this.streak >= STREAK.BLAZING) return 3;
    if (this.streak >= STREAK.ON_FIRE) return 2;
    if (this.streak >= STREAK.HEATING_UP) return 1;
    return 0;
  }

  getStreakLabel() {
    const level = this.getStreakLevel();
    if (level === 4) return 'UNSTOPPABLE!';
    if (level === 3) return 'BLAZING!';
    if (level === 2) return 'ON FIRE!';
    if (level === 1) return 'HEATING UP';
    return '';
  }

  getStreakBonus() {
    const level = this.getStreakLevel();
    if (level >= 4) return 3;
    if (level >= 3) return 2;
    if (level >= 2) return 1;
    return 0;
  }

  // Returns points scored and any notification text
  scoreShot(isSwish) {
    this.streak++;
    let points = isSwish ? 3 : 2;
    points += this.getStreakBonus();

    // Bonus time doubles points
    if (this.bonusTimeActive) {
      points *= 2;
    }

    this.stageScore += points;
    this.totalScore += points;

    const notifications = [];
    if (isSwish) notifications.push('SWISH!');

    // Check streak milestones
    if (this.streak === STREAK.HEATING_UP) notifications.push('HEATING UP!');
    else if (this.streak === STREAK.ON_FIRE) notifications.push('ON FIRE!');
    else if (this.streak === STREAK.BLAZING) notifications.push('BLAZING!');
    else if (this.streak === STREAK.UNSTOPPABLE) notifications.push('UNSTOPPABLE!');

    return { points, notifications, streakMilestone: this._isStreakMilestone() };
  }

  missShot() {
    this.streak = 0;
  }

  // Endless mode: every make is worth exactly 1 point. Swish and streak
  // bonuses are returned as extra seconds for the caller to add to the
  // clock, never as bonus points.
  scoreEndlessShot(isSwish) {
    this.streak++;
    this.totalScore += 1;

    const streakTimeBonus = this.getStreakBonus();

    const notifications = [];
    if (isSwish) notifications.push('SWISH!');
    if (this.streak === STREAK.HEATING_UP) notifications.push('HEATING UP!');
    else if (this.streak === STREAK.ON_FIRE) notifications.push('ON FIRE!');
    else if (this.streak === STREAK.BLAZING) notifications.push('BLAZING!');
    else if (this.streak === STREAK.UNSTOPPABLE) notifications.push('UNSTOPPABLE!');

    return { streakTimeBonus, notifications, streakMilestone: this._isStreakMilestone() };
  }

  _isStreakMilestone() {
    return this.streak === STREAK.HEATING_UP ||
           this.streak === STREAK.ON_FIRE ||
           this.streak === STREAK.BLAZING ||
           this.streak === STREAK.UNSTOPPABLE;
  }

  updateTimer(dt) {
    this.timeRemaining -= dt;
    if (this.timeRemaining < 0) this.timeRemaining = 0;

    // Check bonus time
    const wasBonusTime = this.bonusTimeActive;
    this.bonusTimeActive = this.timeRemaining <= BONUS_TIME_THRESHOLD && this.timeRemaining > 0;

    return {
      timeUp: this.timeRemaining <= 0,
      bonusTimeJustStarted: this.bonusTimeActive && !wasBonusTime,
    };
  }

  isStageComplete() {
    return this.stageScore >= this.stageData.target;
  }

  advanceStage() {
    // Carry over half of remaining time
    const carryOver = Math.floor(this.timeRemaining / 2);
    this.stageNum++;
    this.stageScore = 0;
    this.stageData = getStageData(this.stageNum);
    this.timeRemaining = this.stageData.time + carryOver;
    this.bonusTimeActive = false;
  }

  // High scores
  _loadHighScores() {
    return readStorage(HIGH_SCORES_KEY, HighScoresSchema) || [];
  }

  isHighScore() {
    if (this.highScores.length < 10) return true;
    return this.totalScore > this.highScores[this.highScores.length - 1].score;
  }

  saveHighScore() {
    const entry = {
      score: this.totalScore,
      stage: this.stageNum,
      date: new Date().toLocaleDateString(),
    };
    this.highScores.push(entry);
    this.highScores.sort((a, b) => b.score - a.score);
    this.highScores = this.highScores.slice(0, 10);
    writeStorage(HIGH_SCORES_KEY, this.highScores);
  }

  getBestScore() {
    return this.highScores.length > 0 ? this.highScores[0].score : 0;
  }
}
