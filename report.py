import pandas as pd

df = pd.read_csv('MMC_Leads_2026-04-27.csv')
df['LEAD_DATE'] = pd.to_datetime(df['LEAD_DATE'], errors='coerce')
df['LAST_CONTACTED'] = pd.to_datetime(df['LAST_CONTACTED'], errors='coerce')
df['EXPECTED_VALUE'] = pd.to_numeric(df['EXPECTED_VALUE'], errors='coerce').fillna(0)

# Agent leaderboard
agent = df.groupby('ASSIGNED_TO').agg(
    total_leads=('LEAD_ID', 'count'),
    pipeline_value=('EXPECTED_VALUE', 'sum'),
    avg_score=('PRIORITY_SCORE', 'mean')
)

# Stuck leads
today = pd.Timestamp.now()
df['days_stuck'] = (today - df['LAST_CONTACTED']).dt.days
stuck = df[df['days_stuck'] > 7]

# Save to Excel
with pd.ExcelWriter('Report.xlsx') as w:
    agent.to_excel(w, sheet_name='Agents')
    stuck.to_excel(w, sheet_name='Stuck')