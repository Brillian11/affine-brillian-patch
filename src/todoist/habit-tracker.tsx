import React, { useState } from 'react';

import { TodoistService, type TodoistTask } from './todoist-service';

interface HabitTrackerProps {
  habits: TodoistTask[];
  onHabitUpdate: () => void;
}

export const HabitTracker: React.FC<HabitTrackerProps> = ({ habits, onHabitUpdate }) => {
  const [viewMode, setViewMode] = useState<'cards' | 'leaderboard'>('cards');
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);

  const handleComplete = async (habit: TodoistTask) => {
    await TodoistService.completeHabit(habit.id);
    onHabitUpdate();
  };

  const handleReset = async (habitId: string) => {
    await TodoistService.resetHabitStreak(habitId);
    onHabitUpdate();
  };

  const todayStr = new Date().toISOString().slice(0, 10);
  const totalStreak = habits.reduce((sum, h) => sum + (h.habit_streak || 0), 0);
  const completedTodayCount = habits.filter(h => h.habit_last_completed === todayStr).length;

  if (habits.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 16px', color: '#888' }}>
        <div style={{ fontSize: '36px', marginBottom: '8px' }}>🔄</div>
        <h4 style={{ margin: '0 0 4px 0', color: '#333' }}>No habit tasks tracked yet</h4>
        <p style={{ margin: 0, fontSize: '13px' }}>
          Open any task&apos;s three-dot menu (⋮) and select <strong>&quot;Track habit&quot;</strong> to start building your streak!
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header Dashboard & View Toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '6px', background: '#f1f5f9', padding: '4px', borderRadius: '8px' }}>
          <button
            onClick={() => setViewMode('cards')}
            style={{
              padding: '4px 12px',
              border: 'none',
              borderRadius: '6px',
              background: viewMode === 'cards' ? '#ffffff' : 'transparent',
              fontWeight: viewMode === 'cards' ? 600 : 500,
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            📋 Habit Cards
          </button>
          <button
            onClick={() => setViewMode('leaderboard')}
            style={{
              padding: '4px 12px',
              border: 'none',
              borderRadius: '6px',
              background: viewMode === 'leaderboard' ? '#ffffff' : 'transparent',
              fontWeight: viewMode === 'leaderboard' ? 600 : 500,
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            🏆 Streak Leaderboard
          </button>
        </div>

        <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: '#475569', fontWeight: 500 }}>
          <span>🔥 Combined Streak: <strong>{totalStreak} days</strong></span>
          <span>✅ Done Today: <strong>{completedTodayCount}/{habits.length}</strong></span>
        </div>
      </div>

      {viewMode === 'leaderboard' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: '#ffffff', padding: '16px', borderRadius: '10px', border: '1px solid #eaeaea' }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#1e293b' }}>🏆 Streak Leaderboard</h4>
          {[...habits]
            .sort((a, b) => (b.habit_streak || 0) - (a.habit_streak || 0))
            .map((habit, rank) => (
              <div
                key={habit.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '8px 12px',
                  background: '#f8fafc',
                  borderRadius: '6px',
                }}
              >
                <span style={{ fontWeight: 700, color: '#64748b', width: '20px' }}>#{rank + 1}</span>
                <span style={{ flex: 1, fontSize: '13px', fontWeight: 500 }}>{habit.content}</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#f97316' }}>🔥 {habit.habit_streak || 0} days</span>
              </div>
            ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
          {habits.map(habit => {
            const streak = habit.habit_streak || 0;
            const longest = habit.habit_longest_streak || 0;
            const isDoneToday = habit.habit_last_completed === todayStr;

            return (
              <div
                key={habit.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  padding: '16px',
                  background: '#ffffff',
                  borderRadius: '10px',
                  border: isDoneToday ? '2px solid #22c55e' : '1px solid #e2e8f0',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', color: '#0f172a' }}>{habit.content}</h4>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>{habit.recurring_pattern || 'daily'}</span>
                  </div>
                  <span
                    style={{
                      fontSize: '14px',
                      fontWeight: 700,
                      color: streak > 0 ? '#f97316' : '#94a3b8',
                      background: streak > 0 ? '#fff7ed' : '#f1f5f9',
                      padding: '2px 8px',
                      borderRadius: '12px',
                    }}
                  >
                    🔥 {streak}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', textAlign: 'center', background: '#f8fafc', padding: '8px', borderRadius: '6px' }}>
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>{streak}</div>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>Current Streak</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>{longest}</div>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>Best Streak</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => { handleComplete(habit).catch(console.error); }}
                    disabled={isDoneToday}
                    style={{
                      flex: 1,
                      padding: '6px 12px',
                      border: 'none',
                      borderRadius: '6px',
                      background: isDoneToday ? '#dcfce7' : '#22c55e',
                      color: isDoneToday ? '#15803d' : '#ffffff',
                      fontWeight: 600,
                      fontSize: '12px',
                      cursor: isDoneToday ? 'default' : 'pointer',
                    }}
                  >
                    {isDoneToday ? '✅ Done Today' : '⚡ Complete Habit'}
                  </button>
                  <button
                    onClick={() => setSelectedHabitId(selectedHabitId === habit.id ? null : habit.id)}
                    style={{
                      padding: '6px 10px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      background: '#ffffff',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    📊
                  </button>
                  <button
                    onClick={() => { handleReset(habit.id).catch(console.error); }}
                    title="Reset Streak"
                    style={{
                      padding: '6px 10px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      background: '#ffffff',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    🔄
                  </button>
                </div>

                {selectedHabitId === habit.id && (
                  <div style={{ fontSize: '11px', color: '#475569', borderTop: '1px solid #f1f5f9', paddingTop: '8px' }}>
                    <strong>Completed Dates ({habit.habit_completed_dates?.length || 0}):</strong>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                      {(habit.habit_completed_dates || []).slice(-7).map(d => (
                        <span key={d} style={{ background: '#e2e8f0', padding: '1px 6px', borderRadius: '4px' }}>
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
