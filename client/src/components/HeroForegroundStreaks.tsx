"use client";

import styles from "./HeroForegroundStreaks.module.css";

export default function HeroForegroundStreaks() {
  // Render multiple span elements for CSS to target and animate
  return (
    <div className={styles.streaksContainer}>
      <span className={`${styles.streak} ${styles.streak1}`}></span>
      <span className={`${styles.streak} ${styles.streak2}`}></span>
      <span className={`${styles.streak} ${styles.streak3}`}></span>
      <span className={`${styles.streak} ${styles.streak4}`}></span>
      {/* Add more spans for more streaks if desired */}
    </div>
  );
}
