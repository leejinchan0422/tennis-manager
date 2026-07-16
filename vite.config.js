import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './', // 파일을 그냥 열거나 어느 경로에 올려도 동작하도록
});
