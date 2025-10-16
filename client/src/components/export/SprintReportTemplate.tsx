// src/components/export/SprintReportTemplate.tsx
import React from "react";
import { Conversation, Task, TaskOutput } from "@prisma/client";

interface ReportProps {
  conversation: Conversation & { tasks: (Task & { outputs: TaskOutput[] })[] };
}

// NOTE: We use inline styles here because Puppeteer needs self-contained HTML.


export const SprintReportTemplate = ({ conversation }: ReportProps) => {
  return (
    <html>
      <head>
        <title>Sprint Report: {conversation.title}</title>
      </head>
      <body style={styles.page}>
        <h1 style={styles.h1}>
          🚀 IdeaSpark Sprint Report: {conversation.title}
        </h1>
        <p style={styles.p}>
          This document contains all the AI-generated assets from your 72-hour
          validation sprint.
        </p>

        {conversation.tasks.map(
          (task) =>
            task.outputs.length > 0 && (
              <div key={task.id}>
                <hr style={styles.hr} />
                <h2 style={styles.h2}>✅ Task: {task.title}</h2>
                <p style={styles.p}>{task.description}</p>

                {task.outputs.map((output, index) => (
                  <div key={output.id} style={{ marginTop: "20px" }}>
                    {task.outputs.length > 1 && (
                      <h3 style={styles.h3}>Version {index + 1}</h3>
                    )}
                    <div style={styles.pre}>
                      <pre style={{ margin: 0, fontSize: "13px" }}>
                        {output.content as string}
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
