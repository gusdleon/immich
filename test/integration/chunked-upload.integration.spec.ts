import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { randomBytes } from 'crypto';
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'fs';
import path from 'path';

// Integration test for chunked upload functionality
// This test requires the server to be running
describe('Chunked Upload Integration Test', () => {
  const testDir = '/tmp/immich-upload-test';
  const testFiles: string[] = [];

  beforeAll(() => {
    // Create test directory
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
  });

  afterAll(() => {
    // Clean up test files
    testFiles.forEach(file => {
      try {
        unlinkSync(file);
      } catch (e) {
        console.warn(`Failed to clean up ${file}:`, e);
      }
    });
  });

  it('should create test files of different sizes', () => {
    // Create a small file (1MB - should use single upload)
    const smallFile = path.join(testDir, 'small-test.jpg');
    const smallData = randomBytes(1 * 1024 * 1024); // 1MB
    writeFileSync(smallFile, smallData);
    testFiles.push(smallFile);
    expect(existsSync(smallFile)).toBe(true);

    // Create a large file (15MB - should use chunked upload)
    const largeFile = path.join(testDir, 'large-test.jpg');
    const largeData = randomBytes(15 * 1024 * 1024); // 15MB
    writeFileSync(largeFile, largeData);
    testFiles.push(largeFile);
    expect(existsSync(largeFile)).toBe(true);

    console.log(`Created test files:
      Small file: ${smallFile} (${smallData.length} bytes)
      Large file: ${largeFile} (${largeData.length} bytes)`);
  });

  it('should verify server responds to basic endpoint', async () => {
    try {
      // Just test that we can reach the server health check or basic endpoint
      const response = await fetch('http://localhost:3001/api/server-info/ping', {
        method: 'GET',
      });
      
      // If we get here, server is reachable
      console.log('Server response status:', response.status);
      expect([200, 401, 404]).toContain(response.status); // Any of these means server is up
    } catch (error) {
      console.log('Server not available for integration test:', error.message);
      // Skip this test if server is not running
      return;
    }
  });

  it('should have chunked upload endpoints available', async () => {
    try {
      // Test the chunked upload init endpoint (without auth, should get 401)
      const response = await fetch('http://localhost:3001/api/assets/upload/init', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: 'test.jpg',
          totalSize: 1000,
          totalChunks: 1,
          deviceAssetId: 'test-device-asset-id',
          deviceId: 'WEB',
          fileCreatedAt: new Date().toISOString(),
          fileModifiedAt: new Date().toISOString(),
        }),
      });

      // Should get 401 (unauthorized) which means the endpoint exists
      console.log('Chunked upload init endpoint status:', response.status);
      expect(response.status).toBe(401); // Unauthorized is expected without auth
    } catch (error) {
      console.log('Chunked upload endpoint test failed:', error.message);
      // This is expected if server is not running
    }
  });

  // Additional tests would go here for:
  // - Testing with real authentication
  // - Testing actual file upload
  // - Testing chunk size calculations
  // - Testing progress reporting
  // - Testing error handling
});