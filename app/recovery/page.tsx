'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';

interface Snapshot {
  snapshot_id: string;
  id: string;
  finding_id: string;
  issue_id: string;
  resource_type: string;
  snapshot_type?: string;
  original_role?: string;
  created_at: string;
  created_by: string;
  reason: string;
  status: string;
  system_name?: string;
  rollback_available?: boolean;
  current_state?: {
    role_name?: string;
    resource_name?: string;
    checkpoint_type?: string;
  };
  before_state?: {
    role_name?: string;
  };
}

export default function RecoveryTab() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const { toast } = useToast();

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://saferemediate-backend-f.onrender.com';

  useEffect(() => {
    fetchSnapshots();
  }, []);

  const fetchSnapshots = async () => {
    try {
      setLoading(true);
      // Use proxy route to avoid CORS and ensure proper routing
      const response = await fetch('/api/proxy/snapshots');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch snapshots: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Handle both array and object with snapshots array
      const snapshotsArray = Array.isArray(data) ? data : (data.snapshots || []);
      
      setSnapshots(snapshotsArray);
    } catch (error) {
      console.error('Error fetching snapshots:', error);
      toast({
        title: 'Error',
        description: 'Failed to load snapshots',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (snapshot: Snapshot) => {
    console.log('[Recovery] handleRestore called with snapshot:', snapshot);

    const snapshotId = snapshot.snapshot_id || snapshot.id;

    if (!snapshotId) {
      toast({
        title: 'Error',
        description: 'Invalid snapshot ID',
        variant: 'destructive',
      });
      return;
    }

    try {
      setRestoring(snapshotId);

      // Determine the correct rollback endpoint based on resource type
      // Check snapshot ID prefix FIRST (most reliable), then resource_type field
      const isIAMRole =
        snapshotId.startsWith('IAMRole-') ||
        snapshotId.startsWith('iam-') ||
        snapshotId.startsWith('SNAP-') ||  // New IAM remediation format
        snapshot.resource_type === 'IAMRole' ||
        snapshot.resource_type === 'IAM_REMEDIATION' ||
        snapshot.snapshot_type === 'IAM_REMEDIATION' ||
        snapshot.current_state?.checkpoint_type === 'IAMRole';

      const isS3Bucket =
        snapshotId.startsWith('S3Bucket-') ||
        snapshotId.startsWith('s3-') ||
        snapshot.resource_type === 'S3Bucket' ||
        snapshot.current_state?.checkpoint_type === 'S3Bucket';

      console.log('[Recovery] Restoring snapshot:', {
        snapshotId,
        resource_type: snapshot.resource_type,
        isIAMRole,
        isS3Bucket,
        finding_id: snapshot.finding_id
      });

      let response;
      if (isIAMRole) {
        // IAM Role checkpoint rollback
        console.log('[Recovery] Using IAM rollback endpoint');
        response = await fetch('/api/proxy/iam-roles/rollback', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            checkpoint_id: snapshotId,
            role_name: snapshot.finding_id || ''
          }),
        });
      } else if (isS3Bucket) {
        // S3 Bucket checkpoint rollback
        console.log('[Recovery] Using S3 rollback endpoint');
        response = await fetch('/api/proxy/s3-buckets/rollback', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            checkpoint_id: snapshotId,
            bucket_name: snapshot.finding_id || ''
          }),
        });
      } else {
        // Security Group snapshot rollback (default)
        console.log('[Recovery] Using SG rollback endpoint');
        response = await fetch(`/api/proxy/remediation/rollback/${snapshotId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(errorData.detail || `Failed to restore: ${response.statusText}`);
      }

      const result = await response.json();

      // After successful rollback, remove the resource from the remediated roles localStorage
      // so it shows up again in the LP dashboard
      const roleName = snapshot.original_role || snapshot.finding_id || '';
      if (roleName && isIAMRole) {
        try {
          // Clear from all known system localStorage keys
          const systemNames = ['alon-prod', 'payment-production', 'default'];
          systemNames.forEach(sysName => {
            const remediatedKey = `remediated_roles_${sysName}`;
            const existing = JSON.parse(localStorage.getItem(remediatedKey) || '[]');
            const filtered = existing.filter((r: string) => r !== roleName);
            if (filtered.length !== existing.length) {
              localStorage.setItem(remediatedKey, JSON.stringify(filtered));
              console.log(`[Recovery] Removed ${roleName} from ${remediatedKey}`);
            }
          });
        } catch (e) {
          console.warn('[Recovery] Failed to update localStorage:', e);
        }
      }

      toast({
        title: 'Success',
        description: `Snapshot ${snapshotId} restored successfully`,
      });

      // Refresh snapshots list
      await fetchSnapshots();
      
    } catch (error) {
      console.error('Error restoring snapshot:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to restore snapshot',
        variant: 'destructive',
      });
    } finally {
      setRestoring(null);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return dateString;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading snapshots...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Recovery & Restore</h1>
        <p className="text-gray-600">
          Restore resources to their previous state using snapshots taken before remediation.
        </p>
      </div>

      {snapshots.length === 0 ? (
        <div className="text-center p-8 bg-gray-50 rounded-lg">
          <p className="text-gray-600">No snapshots available</p>
          <button
            onClick={fetchSnapshots}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Refresh
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {snapshots.map((snapshot) => {
            const snapshotId = snapshot.snapshot_id || snapshot.id;
            const isRestoring = restoring === snapshotId;
            // Determine resource type from snapshot ID prefix or resource_type field
            let resourceType = 'SecurityGroup';
            if (snapshotId.startsWith('SNAP-')) {
              // New IAM remediation format - use resource_type field
              resourceType = snapshot.resource_type === 'IAMRole' ? 'IAM Role' : (snapshot.resource_type || 'IAM Role');
            } else if (snapshotId.startsWith('IAMRole-') || snapshotId.startsWith('iam-')) {
              resourceType = 'IAM Role';
            } else if (snapshotId.startsWith('S3Bucket-') || snapshotId.startsWith('s3-')) {
              resourceType = 'S3 Bucket';
            } else if (snapshot.resource_type) {
              resourceType = snapshot.resource_type;
            } else if (snapshot.current_state?.checkpoint_type) {
              resourceType = snapshot.current_state.checkpoint_type;
            }

            // Extract resource name - for IAM roles, extract from snapshot ID or original_role
            let resourceName = 'Unknown Resource';
            if (snapshotId.startsWith('SNAP-')) {
              // New IAM remediation format - use original_role
              resourceName = snapshot.original_role || 'Unknown Role';
            } else if (snapshotId.startsWith('IAMRole-')) {
              // Extract role name from snapshot ID: IAMRole-{roleName}-{hash}
              const parts = snapshotId.replace('IAMRole-', '').split('-');
              parts.pop(); // Remove the hash at the end
              resourceName = parts.join('-') || 'Unknown Role';
            } else if (snapshotId.startsWith('S3Bucket-')) {
              // Extract bucket name from snapshot ID: S3Bucket-{bucketName}-{hash}
              const parts = snapshotId.replace('S3Bucket-', '').split('-');
              parts.pop(); // Remove the hash
              resourceName = parts.join('-') || 'Unknown Bucket';
            } else {
              resourceName =
                snapshot.original_role ||
                snapshot.current_state?.resource_name ||
                snapshot.current_state?.role_name ||
                snapshot.before_state?.role_name ||
                snapshot.finding_id ||
                'Unknown Resource';
            }

            return (
              <div
                key={snapshotId}
                className="border rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-lg">
                        {resourceName}
                      </h3>
                      <span className={`px-2 py-1 text-xs rounded ${
                        resourceType === 'S3 Bucket' || resourceType === 'S3Bucket'
                          ? 'bg-orange-100 text-orange-800'
                          : resourceType === 'IAM Role' || resourceType === 'IAMRole'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {resourceType}
                      </span>
                      <span className={`px-2 py-1 text-xs rounded ${
                        snapshot.status === 'ACTIVE' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {snapshot.status || 'ACTIVE'}
                      </span>
                    </div>
                    
                    <div className="text-sm text-gray-600 space-y-1">
                      <p>
                        <span className="font-medium">Snapshot ID:</span> {snapshotId}
                      </p>
                      <p>
                        <span className="font-medium">Issue ID:</span> {snapshot.finding_id || snapshot.issue_id || 'N/A'}
                      </p>
                      <p>
                        <span className="font-medium">Created:</span> {formatDate(snapshot.created_at)}
                      </p>
                      {snapshot.reason && (
                        <p>
                          <span className="font-medium">Reason:</span> {snapshot.reason}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <button
                    type="button"
                    onClick={() => handleRestore(snapshot)}
                    disabled={isRestoring}
                    className={`ml-4 px-4 py-2 rounded font-medium transition-colors ${
                      isRestoring
                        ? 'bg-gray-400 text-white cursor-not-allowed'
                        : 'bg-green-600 text-white hover:bg-green-700'
                    }`}
                  >
                    {isRestoring ? 'Restoring...' : 'Restore'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Force redeploy Sun Jan 18 01:02:01 IST 2026
