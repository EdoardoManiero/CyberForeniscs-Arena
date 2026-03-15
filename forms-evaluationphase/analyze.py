#!/usr/bin/env python3
"""
CyberForensics Arena – Evaluation Data Analysis
Reads Google Form answers and platform event logs, computes all metrics,
prints summary tables, and generates 6 publication-quality charts (PDF).
"""

import csv
import json
import re
import os
import sys
from datetime import datetime, timedelta
from collections import defaultdict, Counter

try:
    import matplotlib
    matplotlib.use('Agg')  # non-interactive backend
    import matplotlib.pyplot as plt
    import matplotlib.ticker as ticker
    import numpy as np
    HAS_MPL = True
except ImportError:
    HAS_MPL = False
    print("[WARN] matplotlib/numpy not installed – skipping chart generation.")
    print("       Install with: pip install matplotlib numpy")

# ── Paths ────────────────────────────────────────────────────────────────────
SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
FORM_CSV    = os.path.join(SCRIPT_DIR, "Google-form-answers.csv")
LOGS_CSV    = os.path.join(SCRIPT_DIR, "CFA-LOGS2.csv")
CHART_DIR   = os.path.join(SCRIPT_DIR, "charts")

# ── Group mapping ────────────────────────────────────────────────────────────
def classify_group(level_of_study: str) -> str:
    l = level_of_study.lower()
    if "msc" in l and "cyber" in l:
        return "G1"
    if "bsc" in l and "computer" in l:
        return "G2"
    return "G3"

GROUP_LABELS = {"G1": "MSc Cybersecurity", "G2": "BSc Computer Science", "G3": "Other / No degree"}

# ── Admin IDs to exclude from analysis ───────────────────────────────────────
ADMIN_EMAILS = {"admin1@cyberforensics.arena"}
ADMIN_CFA_IDS = {"CFA-CJYMMU", "CFA-4JOEY5"}

# ── 1. Parse Google Form ─────────────────────────────────────────────────────
def parse_form(path):
    participants = []
    with open(path, encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader)
        for row in reader:
            if len(row) < 29:
                continue
            cfa_id = row[6].strip().upper()
            if not cfa_id.startswith("CFA-"):
                continue
            p = {
                "cfa_id":     cfa_id,
                "timestamp":  row[0],
                "study":      row[1],
                "cli":        int(row[2]),
                "df":         int(row[3]),
                "ctf":        row[4].strip().lower(),
                "gamified":   row[5].strip().lower(),
                "group":      classify_group(row[1]),
                # SUS items (columns 7-16, 1-indexed in form → 0-indexed here)
                "sus_raw":    [int(row[i]) for i in range(7, 17)],
                # Engagement items (columns 17-21): realistic, narrative, 3D, motivated, would use again
                "engagement": [int(row[i]) for i in range(17, 22)],
                # Learning items (columns 22-26): clearer understanding, think like investigator, difficulty, hints, confidence
                "learning":   [int(row[i]) for i in range(22, 27)],
                # Open-ended (columns 27-29)
                "open_useful":     row[27].strip() if len(row) > 27 else "",
                "open_confusing":  row[28].strip() if len(row) > 28 else "",
                "open_suggestion": row[29].strip() if len(row) > 29 else "",
            }
            participants.append(p)
    return participants

# ── SUS calculation ──────────────────────────────────────────────────────────
def compute_sus(raw_10: list[int]) -> float:
    """Brooke (1996) SUS formula: odd items (1,3,5,7,9) → val-1; even (2,4,6,8,10) → 5-val; sum×2.5"""
    total = 0
    for i, v in enumerate(raw_10):
        if i % 2 == 0:   # odd items (0-indexed → positions 0,2,4,6,8)
            total += (v - 1)
        else:             # even items
            total += (5 - v)
    return total * 2.5

# ── 2. Parse event logs ─────────────────────────────────────────────────────
def parse_logs(path):
    events = []
    with open(path, encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader)
        for row in reader:
            if len(row) < 10:
                continue
            cfa_id = row[3].strip()
            email  = row[7].strip().strip('"')
            if cfa_id in ADMIN_CFA_IDS or email in ADMIN_EMAILS:
                continue
            # Parse event data JSON (CSV uses doubled-quotes)
            raw_data = row[9].strip()
            try:
                event_data = json.loads(raw_data)
            except (json.JSONDecodeError, Exception):
                event_data = {}
            events.append({
                "id":          int(row[0]),
                "timestamp":   datetime.strptime(row[1].strip(), "%Y-%m-%d %H:%M:%S"),
                "event_type":  row[2].strip(),
                "cfa_id":      cfa_id,
                "user_id":     row[4].strip(),
                "user_name":   row[5].strip().strip('"'),
                "email":       email,
                "scenario":    row[7 + 1].strip() if len(row) > 8 else "",  # Scenario is col 8 (0-indexed: 7)
                "task_id":     row[9 - 1].strip() if len(row) > 9 else "",  # Task ID is col 9 (0-indexed: 8)
                "data":        event_data,
            })
    # Fix column mapping – let me re-read the header
    return events

def parse_logs_v2(path):
    """Correct column-aware parser."""
    events = []
    with open(path, encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader)
        # header: ID, Timestamp, Event Type, Participant ID, User ID, User Name, User Email, Scenario, Task ID, Event Data
        for row in reader:
            if len(row) < 10:
                continue
            cfa_id  = row[3].strip()
            email   = row[6].strip().strip('"')
            if cfa_id in ADMIN_CFA_IDS or email in ADMIN_EMAILS:
                continue
            raw_data = row[9].strip()
            try:
                event_data = json.loads(raw_data)
            except Exception:
                event_data = {}
            events.append({
                "id":          int(row[0]),
                "timestamp":   datetime.strptime(row[1].strip(), "%Y-%m-%d %H:%M:%S"),
                "event_type":  row[2].strip(),
                "cfa_id":      cfa_id,
                "user_id":     row[4].strip(),
                "user_name":   row[5].strip().strip('"'),
                "email":       email,
                "scenario":    row[7].strip(),
                "task_id":     row[8].strip(),
                "data":        event_data,
            })
    # Sort chronologically
    events.sort(key=lambda e: e["timestamp"])
    return events

# ── 3. Compute metrics ───────────────────────────────────────────────────────

# Max gap between events to consider as same session (30 minutes)
ACTIVE_SESSION_GAP = 30 * 60  # seconds

def _active_time(events_sorted):
    """Sum of inter-event gaps where gap < ACTIVE_SESSION_GAP."""
    if len(events_sorted) < 2:
        return 0
    total = 0
    for i in range(1, len(events_sorted)):
        gap = (events_sorted[i]["timestamp"] - events_sorted[i-1]["timestamp"]).total_seconds()
        if gap < ACTIVE_SESSION_GAP:
            total += gap
    return total


def compute_log_metrics(events, participant_ids):
    """Compute per-participant metrics from event log."""
    metrics = {}
    for pid in participant_ids:
        p_events = [e for e in events if e["cfa_id"] == pid]
        if not p_events:
            metrics[pid] = None
            continue

        m = {
            "total_commands": 0,
            "error_commands": 0,
            "scenarios_played": set(),
            "tasks_completed": {},       # scenario -> set of task_ids
            "wrong_attempts": {},        # task_id -> count
            "hints": 0,
            "session_duration_fs": None, # seconds (active time only)
            "session_duration_net": None,
            "per_task_time_fs": {},       # task_id -> seconds
            "total_score": 0,
        }

        # Compute active session duration per scenario (excludes overnight/multi-day gaps)
        fs_events = sorted([e for e in p_events if e["scenario"] == "file_system_forensic"],
                           key=lambda e: e["timestamp"])
        net_events = sorted([e for e in p_events if e["scenario"] == "network_forensic"],
                            key=lambda e: e["timestamp"])

        if fs_events:
            m["session_duration_fs"] = _active_time(fs_events)
        if net_events:
            m["session_duration_net"] = _active_time(net_events)

        # Commands
        cmds = [e for e in p_events if e["event_type"] == "command_execute"]
        m["total_commands"] = len(cmds)
        m["error_commands"] = sum(1 for c in cmds if c["data"].get("hasError", False))

        # Task submissions
        submissions = [e for e in p_events if e["event_type"] in ("task_submit", "flag_submit")]
        for s in submissions:
            tid = s["task_id"]
            scen = s["scenario"]
            correct = s["data"].get("correct", False)
            score   = s["data"].get("scoreAwarded", 0)

            if correct:
                if scen not in m["tasks_completed"]:
                    m["tasks_completed"][scen] = set()
                m["tasks_completed"][scen].add(tid)
                m["total_score"] += score
            else:
                m["wrong_attempts"][tid] = m["wrong_attempts"].get(tid, 0) + 1

        m["scenarios_played"] = set(e["scenario"] for e in p_events if e["scenario"])

        # Hints
        m["hints"] = sum(1 for e in p_events if e["event_type"] == "hint_request")

        # Per-task completion time (FS scenario)
        # Use inter-submission gaps, capping at ACTIVE_SESSION_GAP to exclude breaks
        fs_starts = [e for e in p_events if e["event_type"] == "scenario_start" and e["scenario"] == "file_system_forensic"]
        fs_correct_submissions = sorted(
            [e for e in p_events
             if e["event_type"] in ("task_submit", "flag_submit")
             and e["scenario"] == "file_system_forensic"
             and e["data"].get("correct", False)],
            key=lambda e: e["timestamp"]
        )
        if fs_correct_submissions and fs_starts:
            prev_time = fs_starts[0]["timestamp"]
            for sub in fs_correct_submissions:
                tid = sub["task_id"]
                delta = (sub["timestamp"] - prev_time).total_seconds()
                # Cap at session gap to exclude multi-day breaks
                if delta > ACTIVE_SESSION_GAP:
                    delta = None  # Mark as break — exclude from analysis
                m["per_task_time_fs"][tid] = delta
                prev_time = sub["timestamp"]

        metrics[pid] = m
    return metrics


# ── 4. Chart generation ──────────────────────────────────────────────────────

# Thesis-friendly style
def setup_style():
    plt.rcParams.update({
        'font.family': 'serif',
        'font.size': 11,
        'axes.titlesize': 13,
        'axes.labelsize': 12,
        'xtick.labelsize': 10,
        'ytick.labelsize': 10,
        'legend.fontsize': 10,
        'figure.dpi': 300,
        'savefig.dpi': 300,
        'savefig.bbox': 'tight',
        'axes.spines.top': False,
        'axes.spines.right': False,
        'axes.grid': True,
        'grid.alpha': 0.3,
    })

# Colour palette (muted, accessible)
COLORS = {"G1": "#2E86AB", "G2": "#A23B72", "G3": "#F18F01"}
GROUP_ORDER = ["G1", "G2", "G3"]


def chart_1_sus(participants, chart_dir):
    """SUS score by group – grouped bar."""
    setup_style()
    fig, ax = plt.subplots(figsize=(7, 4.5))

    groups_data = defaultdict(list)
    for p in participants:
        groups_data[p["group"]].append(p["sus"])

    x = np.arange(len(GROUP_ORDER))
    means = [np.mean(groups_data[g]) if groups_data[g] else 0 for g in GROUP_ORDER]
    stds  = [np.std(groups_data[g]) if groups_data[g] else 0 for g in GROUP_ORDER]
    colors = [COLORS[g] for g in GROUP_ORDER]

    bars = ax.bar(x, means, yerr=stds, capsize=5, color=colors, edgecolor="white", width=0.55)

    # Overall mean line
    overall = np.mean([p["sus"] for p in participants])
    ax.axhline(y=overall, color="#555555", linestyle="--", linewidth=1, label=f"Overall mean ({overall:.1f})")
    # "Above average" threshold
    ax.axhline(y=68, color="#BBBBBB", linestyle=":", linewidth=1, label="Above average (68)")

    ax.set_xticks(x)
    ax.set_xticklabels([GROUP_LABELS[g] for g in GROUP_ORDER], fontsize=10)
    ax.set_ylabel("SUS Score (0–100)")
    ax.set_title("System Usability Scale by Group")
    ax.set_ylim(0, 105)
    ax.legend(loc="lower right")

    # Value labels on bars
    for bar, m in zip(bars, means):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 2, f"{m:.1f}",
                ha="center", va="bottom", fontsize=10, fontweight="bold")

    plt.savefig(os.path.join(chart_dir, "chart_sus_by_group.pdf"))
    plt.savefig(os.path.join(chart_dir, "chart_sus_by_group.png"))
    plt.close()
    print("  [OK] Chart 1: SUS by group")


def chart_2_engagement_learning(participants, chart_dir):
    """Engagement vs Perceived Learning by group – grouped bar."""
    setup_style()
    fig, ax = plt.subplots(figsize=(7, 4.5))

    eng_data = defaultdict(list)
    learn_data = defaultdict(list)
    for p in participants:
        eng_data[p["group"]].append(p["engagement_mean"])
        learn_data[p["group"]].append(p["learning_mean"])

    x = np.arange(len(GROUP_ORDER))
    w = 0.3
    eng_means   = [np.mean(eng_data[g]) if eng_data[g] else 0 for g in GROUP_ORDER]
    learn_means = [np.mean(learn_data[g]) if learn_data[g] else 0 for g in GROUP_ORDER]

    bars1 = ax.bar(x - w/2, eng_means, w, label="Engagement", color="#2E86AB", edgecolor="white")
    bars2 = ax.bar(x + w/2, learn_means, w, label="Perceived Learning", color="#F18F01", edgecolor="white")

    ax.set_xticks(x)
    ax.set_xticklabels([GROUP_LABELS[g] for g in GROUP_ORDER], fontsize=10)
    ax.set_ylabel("Mean Likert Score (1–5)")
    ax.set_title("Engagement and Perceived Learning by Group")
    ax.set_ylim(0, 5.5)
    ax.legend()

    for bar, m in zip(list(bars1) + list(bars2), eng_means + learn_means):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.08,
                f"{m:.1f}", ha="center", va="bottom", fontsize=9)

    plt.savefig(os.path.join(chart_dir, "chart_engagement_learning.pdf"))
    plt.savefig(os.path.join(chart_dir, "chart_engagement_learning.png"))
    plt.close()
    print("  [OK] Chart 2: Engagement vs Learning")


def chart_3_session_duration(participants, log_metrics, chart_dir):
    """FS Session duration – horizontal bar per participant."""
    setup_style()
    fig, ax = plt.subplots(figsize=(7, 5))

    data = []
    for p in participants:
        pid = p["cfa_id"]
        m = log_metrics.get(pid)
        if m and m["session_duration_fs"]:
            mins = m["session_duration_fs"] / 60
            data.append((p["label"], mins, p["group"]))

    data.sort(key=lambda x: x[1], reverse=True)
    labels = [d[0] for d in data]
    values = [d[1] for d in data]
    colors = [COLORS[d[2]] for d in data]

    y = np.arange(len(labels))
    ax.barh(y, values, color=colors, edgecolor="white", height=0.6)
    ax.set_yticks(y)
    ax.set_yticklabels(labels)
    ax.set_xlabel("Session Duration (minutes)")
    ax.set_title("File System Scenario – Session Duration")
    ax.invert_yaxis()

    for i, v in enumerate(values):
        ax.text(v + 0.3, i, f"{v:.0f} min", va="center", fontsize=9)

    # Legend
    from matplotlib.patches import Patch
    legend_elements = [Patch(facecolor=COLORS[g], label=GROUP_LABELS[g]) for g in GROUP_ORDER]
    ax.legend(handles=legend_elements, loc="lower right", fontsize=9)

    plt.savefig(os.path.join(chart_dir, "chart_session_duration.pdf"))
    plt.savefig(os.path.join(chart_dir, "chart_session_duration.png"))
    plt.close()
    print("  [OK] Chart 3: Session duration")


def chart_4_wrong_attempts(participants, log_metrics, chart_dir):
    """Wrong attempts per task – stacked bar by group."""
    setup_style()

    # Collect wrong attempts per task across all participants
    all_tasks = sorted(set(
        tid for pid in log_metrics
        if log_metrics[pid]
        for tid in log_metrics[pid]["wrong_attempts"]
        if tid.startswith("fs_task_")
    ), key=lambda t: int(re.search(r'\d+', t).group()))

    group_wrong = {g: [] for g in GROUP_ORDER}
    pid_to_group = {p["cfa_id"]: p["group"] for p in participants}

    for g in GROUP_ORDER:
        for tid in all_tasks:
            total = 0
            for pid, m in log_metrics.items():
                if m and pid_to_group.get(pid) == g:
                    total += m["wrong_attempts"].get(tid, 0)
            group_wrong[g].append(total)

    fig, ax = plt.subplots(figsize=(10, 5))
    x = np.arange(len(all_tasks))
    w = 0.6
    bottom = np.zeros(len(all_tasks))

    for g in GROUP_ORDER:
        vals = np.array(group_wrong[g], dtype=float)
        ax.bar(x, vals, w, bottom=bottom, label=GROUP_LABELS[g], color=COLORS[g], edgecolor="white")
        bottom += vals

    ax.set_xticks(x)
    ax.set_xticklabels([t.replace("fs_task_", "T") for t in all_tasks], fontsize=9)
    ax.set_xlabel("Task")
    ax.set_ylabel("Wrong Attempts")
    ax.set_title("Wrong Submission Attempts per Task (File System Scenario)")
    ax.legend()

    plt.savefig(os.path.join(chart_dir, "chart_wrong_attempts.pdf"))
    plt.savefig(os.path.join(chart_dir, "chart_wrong_attempts.png"))
    plt.close()
    print("  [OK] Chart 4: Wrong attempts per task")


def chart_5_command_errors(participants, log_metrics, chart_dir):
    """Command error rate per participant."""
    setup_style()
    fig, ax = plt.subplots(figsize=(8, 4.5))

    data = []
    for p in participants:
        pid = p["cfa_id"]
        m = log_metrics.get(pid)
        if m and m["total_commands"] > 0:
            rate = (m["error_commands"] / m["total_commands"]) * 100
            data.append((p["label"], rate, p["group"]))

    data.sort(key=lambda x: x[1], reverse=True)
    labels = [d[0] for d in data]
    values = [d[1] for d in data]
    colors = [COLORS[d[2]] for d in data]

    x = np.arange(len(labels))
    bars = ax.bar(x, values, color=colors, edgecolor="white", width=0.6)
    ax.set_xticks(x)
    ax.set_xticklabels(labels, rotation=30, ha="right", fontsize=9)
    ax.set_ylabel("Error Rate (%)")
    ax.set_title("Command Error Rate by Participant")

    for bar, v in zip(bars, values):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.5,
                f"{v:.0f}%", ha="center", va="bottom", fontsize=9)

    from matplotlib.patches import Patch
    legend_elements = [Patch(facecolor=COLORS[g], label=GROUP_LABELS[g]) for g in GROUP_ORDER]
    ax.legend(handles=legend_elements, loc="upper right", fontsize=9)

    plt.savefig(os.path.join(chart_dir, "chart_command_errors.pdf"))
    plt.savefig(os.path.join(chart_dir, "chart_command_errors.png"))
    plt.close()
    print("  [OK] Chart 5: Command error rate")


def chart_6_pertask_timeline(participants, log_metrics, chart_dir):
    """Per-task completion time (line chart) for FS scenario."""
    setup_style()
    fig, ax = plt.subplots(figsize=(10, 5))

    fs_tasks = [f"fs_task_{i}" for i in range(1, 18)]
    task_labels = [f"T{i}" for i in range(1, 18)]

    for p in participants:
        pid = p["cfa_id"]
        m = log_metrics.get(pid)
        if not m or not m["per_task_time_fs"]:
            continue
        times = [m["per_task_time_fs"].get(t, None) for t in fs_tasks]
        # Only plot valid (non-None, non-break) data points for participants who completed 5+ tasks
        valid = [(i, t) for i, t in enumerate(times) if t is not None]
        if len(valid) < 5:
            continue
        xs = [v[0] for v in valid]
        ys = [v[1] for v in valid]
        ax.plot(xs, ys, marker="o", markersize=4, linewidth=1.5,
                color=COLORS[p["group"]], alpha=0.7, label=p["label"])

    ax.set_xticks(range(len(fs_tasks)))
    ax.set_xticklabels(task_labels, fontsize=9)
    ax.set_xlabel("Task")
    ax.set_ylabel("Time to Complete (seconds)")
    ax.set_title("Per-Task Completion Time – File System Scenario")
    ax.legend(fontsize=8, ncol=2, loc="upper left")

    plt.savefig(os.path.join(chart_dir, "chart_pertask_timeline.pdf"))
    plt.savefig(os.path.join(chart_dir, "chart_pertask_timeline.png"))
    plt.close()
    print("  [OK] Chart 6: Per-task completion timeline")


# ── 5. Pretty-print tables ──────────────────────────────────────────────────

def print_table(title, headers, rows):
    print(f"\n{'='*80}")
    print(f"  {title}")
    print(f"{'='*80}")
    col_widths = [max(len(str(h)), max((len(str(r[i])) for r in rows), default=0)) for i, h in enumerate(headers)]
    header_str = " | ".join(str(h).ljust(w) for h, w in zip(headers, col_widths))
    print(header_str)
    print("-+-".join("-" * w for w in col_widths))
    for row in rows:
        print(" | ".join(str(c).ljust(w) for c, w in zip(row, col_widths)))


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("CyberForensics Arena – Evaluation Analysis")
    print("=" * 50)

    # Parse data
    participants = parse_form(FORM_CSV)
    events = parse_logs_v2(LOGS_CSV)
    print(f"Loaded {len(participants)} form responses, {len(events)} log events")

    # Compute form-derived metrics
    for i, p in enumerate(participants):
        p["sus"] = compute_sus(p["sus_raw"])
        p["engagement_mean"] = sum(p["engagement"]) / len(p["engagement"])
        p["learning_mean"]   = sum(p["learning"]) / len(p["learning"])
        p["label"] = f"P{i+1} ({p['group']})"

    # Compute log metrics
    pids = [p["cfa_id"] for p in participants]
    log_metrics = compute_log_metrics(events, pids)

    # ── Table 1: Participant Profiles ────────────────────────────────────
    rows = []
    for i, p in enumerate(participants):
        m = log_metrics.get(p["cfa_id"])
        has_logs = "Yes" if m else "No"
        rows.append([
            f"P{i+1}",
            p["group"],
            p["study"][:25],
            p["cli"],
            p["df"],
            p["ctf"],
            p["gamified"],
            has_logs,
        ])
    print_table("Participant Profiles", ["ID", "Group", "Study Level", "CLI", "DF", "CTF", "Gamified", "Logs?"], rows)

    # ── Table 2: SUS Scores ──────────────────────────────────────────────
    rows = []
    for i, p in enumerate(participants):
        rows.append([f"P{i+1}", p["group"], f"{p['sus']:.1f}"])
    # Group means
    for g in GROUP_ORDER:
        vals = [p["sus"] for p in participants if p["group"] == g]
        if vals:
            rows.append([f"Mean {g}", g, f"{sum(vals)/len(vals):.1f}"])
    overall_sus = [p["sus"] for p in participants]
    rows.append(["OVERALL", "--", f"{sum(overall_sus)/len(overall_sus):.1f}"])
    print_table("SUS Scores", ["ID", "Group", "SUS"], rows)

    # ── Table 3: Engagement & Learning ───────────────────────────────────
    rows = []
    for i, p in enumerate(participants):
        rows.append([f"P{i+1}", p["group"], f"{p['engagement_mean']:.2f}", f"{p['learning_mean']:.2f}"])
    for g in GROUP_ORDER:
        e_vals = [p["engagement_mean"] for p in participants if p["group"] == g]
        l_vals = [p["learning_mean"]   for p in participants if p["group"] == g]
        if e_vals:
            rows.append([f"Mean {g}", g, f"{sum(e_vals)/len(e_vals):.2f}", f"{sum(l_vals)/len(l_vals):.2f}"])
    print_table("Engagement & Perceived Learning", ["ID", "Group", "Engagement", "Learning"], rows)

    # ── Table 4: Task Completion & Session Duration ──────────────────────
    rows = []
    for i, p in enumerate(participants):
        m = log_metrics.get(p["cfa_id"])
        if not m:
            rows.append([f"P{i+1}", p["group"], "No logs", "--", "--", "--"])
            continue
        fs_done = len(m["tasks_completed"].get("file_system_forensic", set()))
        net_done = len(m["tasks_completed"].get("network_forensic", set()))
        fs_dur = f"{m['session_duration_fs']/60:.0f} min" if m["session_duration_fs"] else "--"
        rows.append([f"P{i+1}", p["group"], f"{fs_done}/17", f"{net_done}/14" if net_done > 0 else "--", fs_dur, m["total_score"]])
    print_table("Task Completion & Session Duration", ["ID", "Group", "FS Tasks", "Net Tasks", "FS Duration", "Score"], rows)

    # ── Table 5: Command Errors ──────────────────────────────────────────
    rows = []
    for i, p in enumerate(participants):
        m = log_metrics.get(p["cfa_id"])
        if not m or m["total_commands"] == 0:
            continue
        rate = (m["error_commands"] / m["total_commands"]) * 100
        rows.append([f"P{i+1}", p["group"], m["total_commands"], m["error_commands"], f"{rate:.1f}%"])
    print_table("Command Error Rate", ["ID", "Group", "Total Cmds", "Errors", "Error %"], rows)

    # ── Table 6: Wrong Attempts ──────────────────────────────────────────
    all_wrong = defaultdict(int)
    for pid, m in log_metrics.items():
        if m:
            for tid, cnt in m["wrong_attempts"].items():
                all_wrong[tid] += cnt
    rows = sorted([(tid, cnt) for tid, cnt in all_wrong.items() if tid.startswith("fs_")],
                  key=lambda x: int(re.search(r'\d+', x[0]).group()))
    print_table("Wrong Attempts per FS Task (all participants)", ["Task", "Wrong Attempts"],
                rows if rows else [["(none)", 0]])

    # ── Table 7: Hints ───────────────────────────────────────────────────
    rows = []
    for i, p in enumerate(participants):
        m = log_metrics.get(p["cfa_id"])
        if m and m["hints"] > 0:
            rows.append([f"P{i+1}", p["group"], m["hints"]])
    if not rows:
        rows = [["(none)", "--", 0]]
    print_table("Hint Usage", ["ID", "Group", "Hints"], rows)

    # ── Qualitative Feedback ─────────────────────────────────────────────
    print(f"\n{'='*80}")
    print("  Qualitative Feedback (Open-Ended)")
    print(f"{'='*80}")
    for i, p in enumerate(participants):
        if p["open_useful"] or p["open_confusing"] or p["open_suggestion"]:
            print(f"\n  P{i+1} ({p['group']}):")
            if p["open_useful"]:
                print(f"    + Useful:     {p['open_useful']}")
            if p["open_confusing"]:
                print(f"    - Confusing:  {p['open_confusing']}")
            if p["open_suggestion"]:
                print(f"    * Suggestion: {p['open_suggestion']}")

    # ── Charts ───────────────────────────────────────────────────────────
    if HAS_MPL:
        os.makedirs(CHART_DIR, exist_ok=True)
        print(f"\nGenerating charts into {CHART_DIR}/ ...")
        chart_1_sus(participants, CHART_DIR)
        chart_2_engagement_learning(participants, CHART_DIR)
        chart_3_session_duration(participants, log_metrics, CHART_DIR)
        chart_4_wrong_attempts(participants, log_metrics, CHART_DIR)
        chart_5_command_errors(participants, log_metrics, CHART_DIR)
        chart_6_pertask_timeline(participants, log_metrics, CHART_DIR)
        print(f"\n[DONE] All charts saved to {CHART_DIR}/")
    else:
        print("\n[SKIP] Charts not generated (matplotlib not available)")

    print("\n[DONE] Analysis complete.")


if __name__ == "__main__":
    main()
