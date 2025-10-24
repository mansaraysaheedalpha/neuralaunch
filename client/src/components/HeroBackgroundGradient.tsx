// src/components/HeroBackgroundGradient.tsx
"use client";

import styles from "./HeroBackgroundGradient.module.css"; // We'll create this CSS Module

export default function HeroBackgroundGradient() {
  return (
    <div className={styles.gradientContainer}>
      <div className={styles.gradientBg}></div>
      {/* Add more divs for more complex gradients if needed */}
      <div className={`${styles.shape} ${styles.shape1}`}></div>
      <div className={`${styles.shape} ${styles.shape2}`}></div>
      <div className={`${styles.shape} ${styles.shape3}`}></div>
      <div className={`${styles.shape} ${styles.shape4}`}></div>
      <div className={`${styles.shape} ${styles.shape5}`}></div>
      <div className={`${styles.shape} ${styles.shape6}`}></div>
    </div>
  );
}
