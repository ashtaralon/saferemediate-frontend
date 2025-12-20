import React, { useState } from 'react';
import { Modal, Button, Spinner, Alert } from 'react-bootstrap';
import axios from 'axios';

interface SimulateFixModalProps {
  show: boolean;
  onHide: () => void;
  roleName: string;
  onSimulationComplete: (results: any) => void;
}

export const SimulateFixModal: React.FC<SimulateFixModalProps> = ({
  show,
  onHide,
  roleName,
  onSimulationComplete,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSimulate = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await axios.post('/api/proxy/remediate', {
        role_name: roleName,
        dry_run: true,
      });

      onSimulationComplete(response.data);
      onHide();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'An error occurred during simulation'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>Simulate Fix for {roleName}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger">{error}</Alert>}
        <p>
          This will simulate the remediation changes for the role{' '}
          <strong>{roleName}</strong> without making any actual changes.
        </p>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleSimulate}
          disabled={loading}
        >
          {loading ? (
            <>
              <Spinner
                as="span"
                animation="border"
                size="sm"
                role="status"
                aria-hidden="true"
                className="me-2"
              />
              Simulating...
            </>
          ) : (
            'Simulate'
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
