// Test script to check for ACTUAL_TRAFFIC edges in the API response
// Run with: node test-actual-traffic.js

const API_URL = process.env.API_URL || 'http://localhost:3000/api/proxy/dependency-map/full?systemName=alon-prod';

async function checkActualTraffic() {
  try {
    console.log('Fetching from:', API_URL);
    const response = await fetch(API_URL);
    const data = await response.json();
    
    console.log('\n=== API Response Summary ===');
    console.log('Total nodes:', data.nodes?.length || 0);
    console.log('Total edges:', data.edges?.length || 0);
    
    // Check for ACTUAL_TRAFFIC edges
    const trafficEdges = (data.edges || []).filter(e => 
      e.edge_type === 'ACTUAL_TRAFFIC' || 
      e.type === 'ACTUAL_TRAFFIC' ||
      e.relationship_type === 'ACTUAL_TRAFFIC'
    );
    
    console.log('\n=== ACTUAL_TRAFFIC Edges ===');
    console.log('Found:', trafficEdges.length);
    
    if (trafficEdges.length > 0) {
      console.log('\nSample edges:');
      trafficEdges.slice(0, 5).forEach((edge, i) => {
        console.log(`\nEdge ${i + 1}:`);
        console.log('  Source:', edge.source);
        console.log('  Target:', edge.target);
        console.log('  Type field:', edge.type || 'N/A');
        console.log('  Edge_type field:', edge.edge_type || 'N/A');
        console.log('  Relationship_type field:', edge.relationship_type || 'N/A');
        console.log('  Port:', edge.port || 'N/A');
        console.log('  Protocol:', edge.protocol || 'N/A');
        console.log('  Hit count:', edge.hit_count || 'N/A');
      });
      
      // Check which field name is used
      const usingType = trafficEdges.filter(e => e.type === 'ACTUAL_TRAFFIC').length;
      const usingEdgeType = trafficEdges.filter(e => e.edge_type === 'ACTUAL_TRAFFIC').length;
      const usingRelationshipType = trafficEdges.filter(e => e.relationship_type === 'ACTUAL_TRAFFIC').length;
      
      console.log('\n=== Field Usage ===');
      console.log('Using "type":', usingType);
      console.log('Using "edge_type":', usingEdgeType);
      console.log('Using "relationship_type":', usingRelationshipType);
    } else {
      console.log('\n⚠️  No ACTUAL_TRAFFIC edges found!');
      console.log('\nChecking all edge types:');
      const edgeTypes = {};
      (data.edges || []).forEach(e => {
        const type = e.type || e.edge_type || e.relationship_type || 'unknown';
        edgeTypes[type] = (edgeTypes[type] || 0) + 1;
      });
      console.log(edgeTypes);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkActualTraffic();

