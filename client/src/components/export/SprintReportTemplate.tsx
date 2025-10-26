// src/components/export/SprintReportTemplate.tsx

import React from "react";
import { Conversation, Task, TaskOutput } from "@prisma/client";
import Head from "next/head";

// Define and export a clear type for the props the component expects.
export interface ReportConversation extends Conversation {
  tasks: (Task & {
    outputs: TaskOutput[];
  })[];
}

interface ReportProps {
  conversation: ReportConversation;
}

// A professional set of inline styles for a clean PDF report.
const styles = {
  page: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    lineHeight: 1.6,
    color: "#333",
    padding: "40px",
  },
  h1: {
    fontSize: "28px",
    color: "#111",
    borderBottom: "2px solid #eee",
    paddingBottom: "15px",
    marginBottom: "10px",
  },
  h2: {
    fontSize: "22px",
    color: "#111",
    marginTop: "40px",
  },
  p: {
    fontSize: "16px",
    color: "#555",
  },
  hr: {
    border: "none",
    borderTop: "1px solid #eee",
    margin: "40px 0",
  },
  taskCard: {
    pageBreakInside: "avoid" as const,
  },
  pre: {
    backgroundColor: "#f6f8fa",
    padding: "16px",
    borderRadius: "6px",
    overflowX: "auto" as const,
    whiteSpace: "pre-wrap" as const,
    wordWrap: "break-word" as const,
    fontSize: "13px",
    lineHeight: 1.45,
    fontFamily: "monospace",
  },
};

export const SprintReportTemplate = ({ conversation }: ReportProps) => {
  return (
    <html>
      <Head>
        <title>Sprint Report: {conversation.title}</title>
      </Head>
      <body style={styles.page}>
        <h1 style={styles.h1}>
          🚀 NeuraLaunch Sprint Report: {conversation.title}
        </h1>
        <p style={styles.p}>
          This document contains all the AI-generated assets from your 72-hour
          validation sprint.
        </p>

        {conversation.tasks.map(
          (task) =>
            task.outputs.length > 0 && (
              <div key={task.id} style={styles.taskCard}>
                <hr style={styles.hr} />
                <h2 style={styles.h2}>✅ Task: {task.title}</h2>
                <p style={styles.p}>{task.description}</p>

                {task.outputs.map((output) => (
                  <div key={output.id} style={{ marginTop: "20px" }}>
                    <div style={styles.pre}>
                      <pre style={{ margin: 0 }}>
                        {JSON.stringify(output.content, null, 2)}
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            )
        )}
      </body>
    </html>
  );
};
