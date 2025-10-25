// src/components/landing-page/analytics/RecentSignupsTable.tsx
import React from "react";
import { EmailSignupData } from "../LandingPageBuilder";

interface RecentSignupsTableProps {
  signups: EmailSignupData[];
}

const RecentSignupsTable: React.FC<RecentSignupsTableProps> = ({ signups }) => {
  return (
    <div className="p-6 border rounded-2xl bg-card shadow-sm h-full">
      {" "}
      {/* Added h-full */}
      <h3 className="text-lg font-semibold text-foreground mb-4">
        Recent Signups
      </h3>
      {signups.length === 0 ? (
        <p className="text-muted-foreground text-sm">No signups yet.</p>
      ) : (
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          {" "}
          {/* Scrollable */}
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 sticky top-0">
              <tr>
                <th scope="col" className="px-4 py-2">
                  Email
                </th>
                <th scope="col" className="px-4 py-2">
                  Name
                </th>
                <th scope="col" className="px-4 py-2">
                  Date
                </th>
                <th scope="col" className="px-4 py-2">
                  Source
                </th>
              </tr>
            </thead>
            <tbody>
              {signups.map((signup) => (
                <tr
                  key={signup.id}
                  className="border-b dark:border-border/50 hover:bg-muted/30"
                >
                  <td className="px-4 py-2 font-medium text-foreground truncate max-w-xs">
                    {signup.email}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {signup.name || "-"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                    {new Date(signup.createdAt).toLocaleDateString()}
                  </td>
                  <td
                    className="px-4 py-2 text-muted-foreground truncate max-w-[100px]"
                    title={signup.source || undefined}
                  >
                    {signup.source
                      ? new URL(signup.source).hostname.replace("www.", "")
                      : "Direct"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default RecentSignupsTable;
